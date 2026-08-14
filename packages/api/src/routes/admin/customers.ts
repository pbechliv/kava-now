import { validationError } from "../../validation";
import { Hono } from "hono";
import { eq, and, or, ne, inArray, notInArray, sql } from "drizzle-orm";
import {
  createCustomerSchema,
  updateCustomerSchema,
  updateCustomerBrandPricingSchema,
  inviteCustomerUserSchema,
  adminCustomersQuerySchema,
  PAYMENT_EXEMPT_STATUSES,
  type AdminCustomerListItem,
  type CustomerBrandPrice,
  type PaginatedResponse,
  API_ERROR_CODES,
  type SuccessResponse,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { accentInsensitiveLike } from "../../db/search";
import {
  customers,
  products,
  customerBrandPricing,
  customerAssignedUsers,
  orders,
  orderItems,
  tenantMemberships,
} from "../../db/schema/index";
import { inviteUserToTenant, InviteConflict } from "../../services/invite-user";
import {
  isUniqueViolation,
  isForeignKeyViolation,
  UNIQUE_CONSTRAINTS,
  FK_CONSTRAINTS,
} from "../../db/errors";
import type { AppEnv } from "../../types";
import type { PreSerialize } from "../../serialize";
import { getTenantId, getUser } from "../../context";

const DUPLICATE_ERP_REF_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_CUSTOMER_ERP_REF,
  error: "Duplicate ERP reference for customer in this tenant",
} as const;

/**
 * Subset of `ids` that are owner/staff members of this tenant. Used to reject
 * assigned-user ids that aren't valid staff before writing them.
 */
async function tenantStaffIdSet(tenantId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        ne(tenantMemberships.role, "customer"),
        inArray(tenantMemberships.userId, ids),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

const customersRouter = new Hono<AppEnv>();

// GET /brands — list distinct brands for this tenant's products
customersRouter.get("/brands", async (c) => {
  const tenantId = getTenantId(c);

  const brands = await db
    .selectDistinct({ brand: products.brand })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.active, true)))
    .orderBy(products.brand);

  return c.json(brands.map((b) => b.brand));
});

// GET / — list customers with optional ?search
customersRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);

  const parsed = adminCustomersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }
  const { search, page, pageSize } = parsed.data;

  const conditions = [eq(customers.tenantId, tenantId)];

  if (search) {
    const match = or(
      accentInsensitiveLike(customers.name, search),
      accentInsensitiveLike(customers.contactPerson, search),
    );
    if (match) conditions.push(match);
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(customers)
    .where(whereClause);
  const total = countRow?.total ?? 0;

  // Per-customer unpaid roll-up (#218): "what does each customer still owe us?".
  // Aggregated once for the whole tenant and joined, rather than a correlated
  // subquery per listed row. Cancelled orders owe nothing (PAYMENT_EXEMPT_STATUSES)
  // and cancelled/replaced lines don't count toward a total — same rules as the
  // orders list. The left join to order_items means an order with no active line
  // contributes 0 to the amount but still counts as an unpaid order.
  const unpaid = db
    .select({
      customerId: orders.customerId,
      amount:
        sql<number>`coalesce(round(sum(${orderItems.quantity} * ${orderItems.unitPrice}::numeric) filter (where ${orderItems.status} = 'active'), 2), 0)::float8`.as(
          "amount",
        ),
      orderCount: sql<number>`count(distinct ${orders.id})::int`.as("order_count"),
    })
    .from(orders)
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "unpaid"),
        notInArray(orders.status, PAYMENT_EXEMPT_STATUSES),
      ),
    )
    .groupBy(orders.customerId)
    .as("unpaid");

  const rows = await db
    .select({
      id: customers.id,
      tenantId: customers.tenantId,
      name: customers.name,
      email: customers.email,
      address: customers.address,
      phone: customers.phone,
      contactPerson: customers.contactPerson,
      notes: customers.notes,
      vatId: customers.vatId,
      taxOffice: customers.taxOffice,
      profession: customers.profession,
      billingAddress: customers.billingAddress,
      erpRef: customers.erpRef,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      outstandingAmount: sql<number>`coalesce(${unpaid.amount}, 0)::float8`,
      unpaidOrderCount: sql<number>`coalesce(${unpaid.orderCount}, 0)::int`,
    })
    .from(customers)
    .leftJoin(unpaid, eq(unpaid.customerId, customers.id))
    .where(whereClause)
    .orderBy(customers.name, customers.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const body = {
    data: rows,
    total,
    page,
    pageSize,
  } satisfies PreSerialize<PaginatedResponse<AdminCustomerListItem>>;
  return c.json(body);
});

// POST / — create customer (also creates a customer-user when email is set)
customersRouter.post("/", async (c) => {
  const tenantId = getTenantId(c);
  const inviter = getUser(c);
  const body = await c.req.json();
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const { assignedUserIds, ...customerData } = parsed.data;
  const assigneeIds = assignedUserIds ?? [];

  // Reject assignees that aren't owner/staff of this tenant before any write.
  if (assigneeIds.length > 0) {
    const valid = await tenantStaffIdSet(tenantId, assigneeIds);
    if (assigneeIds.some((id) => !valid.has(id))) {
      return c.json({ error: { assignedUserIds: ["Μη έγκυροι χρήστες"] } }, 400);
    }
  }

  let customer;
  try {
    [customer] = await db
      .insert(customers)
      .values({ ...customerData, tenantId })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.customerErpRef)) {
      return c.json(DUPLICATE_ERP_REF_RESPONSE, 409);
    }
    throw err;
  }

  if (!customer) {
    return c.json({ error: "Failed to create customer" }, 500);
  }
  const createdCustomerId = customer.id;

  // Assignments share the request transaction with the insert above, so a
  // failure here rolls the customer back too (atomic).
  if (assigneeIds.length > 0) {
    await db
      .insert(customerAssignedUsers)
      .values(assigneeIds.map((userId) => ({ tenantId, customerId: createdCustomerId, userId })));
  }

  // If email provided, also create a linked customer-user + send the
  // welcome set-password link. We don't fail the whole request if email
  // already belongs to another user in this tenant — the customer row is
  // still useful.
  let userInviteError: string | null = null;
  if (parsed.data.email) {
    try {
      await inviteUserToTenant({
        c,
        tenantId,
        email: parsed.data.email,
        name: parsed.data.name,
        role: "customer",
        customerId: customer.id,
        inviterId: inviter.id,
      });
    } catch (err) {
      // Safe to swallow: the invite's writes run in their own savepoint, so a
      // failure here can no longer abort the request transaction and turn the
      // final COMMIT into a silent ROLLBACK of the customer row (#46).
      if (err instanceof InviteConflict) {
        userInviteError = err.message;
      } else {
        console.error("[customers] Customer-user invite failed:", err);
        userInviteError = "User invite failed — resend the invite from the customer page";
      }
    }
  }

  return c.json({ ...customer, userInviteError }, 201);
});

// GET /:id — single customer
customersRouter.get("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");

  const [customer] = await db
    .select({
      id: customers.id,
      tenantId: customers.tenantId,
      name: customers.name,
      email: customers.email,
      address: customers.address,
      phone: customers.phone,
      contactPerson: customers.contactPerson,
      notes: customers.notes,
      vatId: customers.vatId,
      taxOffice: customers.taxOffice,
      profession: customers.profession,
      billingAddress: customers.billingAddress,
      erpRef: customers.erpRef,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const assigned = await db
    .select({ userId: customerAssignedUsers.userId })
    .from(customerAssignedUsers)
    .where(
      and(eq(customerAssignedUsers.customerId, id), eq(customerAssignedUsers.tenantId, tenantId)),
    );

  return c.json({ ...customer, assignedUserIds: assigned.map((a) => a.userId) });
});

// PUT /:id — update customer
customersRouter.put("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const { assignedUserIds, ...customerData } = parsed.data;

  // Reject invalid assignees before any write.
  if (assignedUserIds !== undefined && assignedUserIds.length > 0) {
    const valid = await tenantStaffIdSet(tenantId, assignedUserIds);
    if (assignedUserIds.some((uid) => !valid.has(uid))) {
      return c.json({ error: { assignedUserIds: ["Μη έγκυροι χρήστες"] } }, 400);
    }
  }

  let customer;
  if (Object.keys(customerData).length > 0) {
    try {
      [customer] = await db
        .update(customers)
        .set(customerData)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.customerErpRef)) {
        return c.json(DUPLICATE_ERP_REF_RESPONSE, 409);
      }
      throw err;
    }
  } else {
    // assignedUserIds-only update — still verify the customer exists.
    [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
      .limit(1);
  }

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  // Replace assignments wholesale when provided (empty array clears them).
  if (assignedUserIds !== undefined) {
    await db
      .delete(customerAssignedUsers)
      .where(
        and(eq(customerAssignedUsers.customerId, id), eq(customerAssignedUsers.tenantId, tenantId)),
      );
    if (assignedUserIds.length > 0) {
      await db
        .insert(customerAssignedUsers)
        .values(assignedUserIds.map((userId) => ({ tenantId, customerId: id, userId })));
    }
  }

  return c.json(customer);
});

// DELETE /:id — fail if customer has orders. Linked memberships cascade.
customersRouter.delete("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");

  // Friendly pre-check; the no-action FK is the race-safe backstop below.
  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.customerId, id), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (ref && ref.count > 0) {
    return c.json(
      {
        code: API_ERROR_CODES.CUSTOMER_HAS_ORDERS,
        error: "Cannot delete a customer with existing orders",
      },
      400,
    );
  }

  try {
    // Savepoint: an FK violation must not abort the request transaction. The
    // FK is INITIALLY DEFERRED (so tenant-purge cascades pass) — force the
    // check to fire now, where it's catchable, instead of at COMMIT.
    const [deleted] = await db.transaction(async (tx) => {
      await tx.execute(sql`set constraints "orders_customer_tenant_fk" immediate`);
      return tx
        .delete(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        .returning();
    });

    if (!deleted) {
      return c.json({ error: "Customer not found" }, 404);
    }

    return c.json({ success: true } satisfies SuccessResponse);
  } catch (err) {
    if (isForeignKeyViolation(err, FK_CONSTRAINTS.orderCustomer)) {
      return c.json(
        {
          code: API_ERROR_CODES.CUSTOMER_HAS_ORDERS,
          error: "Cannot delete a customer with existing orders",
        },
        400,
      );
    }
    throw err;
  }
});

// GET /:id/brand-pricing — list all brands with this customer's discounts
customersRouter.get("/:id/brand-pricing", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");

  // Verify customer exists
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const brands = await db
    .selectDistinct({ brand: products.brand })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.active, true)))
    .orderBy(products.brand);

  const pricing = await db
    .select()
    .from(customerBrandPricing)
    .where(eq(customerBrandPricing.customerId, id));

  const pricingMap = new Map(pricing.map((p) => [p.brand, p.discountPct]));

  const result: CustomerBrandPrice[] = brands.map((b) => ({
    brand: b.brand,
    discountPct: pricingMap.has(b.brand) ? Number(pricingMap.get(b.brand)) : 0,
  }));

  return c.json(result);
});

// PUT /:id/brand-pricing — bulk update brand discounts for customer
customersRouter.put("/:id/brand-pricing", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCustomerBrandPricingSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  await db
    .delete(customerBrandPricing)
    .where(
      and(eq(customerBrandPricing.customerId, id), eq(customerBrandPricing.tenantId, tenantId)),
    );

  const withDiscount = parsed.data.assignments.filter((a) => a.discountPct > 0);
  if (withDiscount.length > 0) {
    await db.insert(customerBrandPricing).values(
      withDiscount.map((a) => ({
        tenantId,
        customerId: id,
        brand: a.brand,
        discountPct: String(a.discountPct),
      })),
    );
  }

  return c.json({ success: true } satisfies SuccessResponse);
});

// A customer's users are listed by GET /admin/customer-users?customerId=… and
// their invites re-sent via POST /admin/users/:id/resend-invite — both are
// tenant-scoped, so neither is duplicated here.

// POST /:id/users/invite — add another user account to an existing customer
customersRouter.post("/:id/users/invite", async (c) => {
  const tenantId = getTenantId(c);
  const inviter = getUser(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = inviteCustomerUserSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  try {
    await inviteUserToTenant({
      c,
      tenantId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: "customer",
      customerId: customer.id,
      inviterId: inviter.id,
    });
  } catch (err) {
    if (err instanceof InviteConflict) {
      return c.json({ code: err.code, error: err.message }, 409);
    }
    throw err;
  }

  return c.json({ success: true } satisfies SuccessResponse);
});

export { customersRouter };
