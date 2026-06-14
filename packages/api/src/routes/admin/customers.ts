import { Hono } from "hono";
import { eq, and, ilike, or, ne, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  createCustomerSchema,
  updateCustomerSchema,
  updateCustomerBrandPricingSchema,
  inviteCustomerUserSchema,
  paginationQuerySchema,
  API_ERROR_CODES,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { escapeLike } from "../../db/escape-like";
import {
  customers,
  products,
  customerBrandPricing,
  customerAssignedUsers,
  orders,
  tenantMemberships,
  users,
} from "../../db/schema/index";
import {
  inviteUserToTenant,
  resendSetPasswordInvite,
  InviteConflict,
} from "../../services/invite-user";
import {
  isUniqueViolation,
  isForeignKeyViolation,
  UNIQUE_CONSTRAINTS,
  FK_CONSTRAINTS,
} from "../../db/errors";
import type { AppEnv } from "../../types";
import { getTenant, getTenantId, getUser } from "../../context";

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
  const search = c.req.query("search");

  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const conditions = [eq(customers.tenantId, tenantId)];

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const match = or(ilike(customers.name, pattern), ilike(customers.contactPerson, pattern));
    if (match) conditions.push(match);
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(customers)
    .where(whereClause);
  const total = countRow?.total ?? 0;

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
    })
    .from(customers)
    .where(whereClause)
    .orderBy(customers.name, customers.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({ data: rows, total, page, pageSize });
});

// POST / — create customer (also creates a customer-user when email is set)
customersRouter.post("/", async (c) => {
  const tenantId = getTenantId(c);
  const inviter = getUser(c);
  const body = await c.req.json();
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
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
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
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

    return c.json({ success: true });
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

  const result = brands.map((b) => ({
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
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
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

  return c.json({ success: true });
});

// GET /:id/users — list users linked to a customer in this tenant
customersRouter.get("/:id/users", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const inviterAlias = alias(users, "inviter");

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      name: users.name,
      createdAt: tenantMemberships.createdAt,
      invitedByName: inviterAlias.name,
      invitedByEmail: inviterAlias.email,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .leftJoin(inviterAlias, eq(tenantMemberships.invitedById, inviterAlias.id))
    .where(and(eq(tenantMemberships.customerId, id), eq(tenantMemberships.tenantId, tenantId)))
    .orderBy(tenantMemberships.createdAt);

  return c.json({ users: rows });
});

// POST /:customerId/users/:userId/resend-invite — re-issue the set-password invite
customersRouter.post("/:customerId/users/:userId/resend-invite", async (c) => {
  const result = await resendSetPasswordInvite({
    c,
    tenantId: getTenantId(c),
    tenantSlug: getTenant(c).slug,
    userId: c.req.param("userId"),
    customerId: c.req.param("customerId"),
  });
  if (!result.ok) {
    return c.json({ code: result.code, error: result.error }, result.status);
  }
  return c.json({ success: true });
});

// POST /:id/users/invite — add another user account to an existing customer
customersRouter.post("/:id/users/invite", async (c) => {
  const tenantId = getTenantId(c);
  const inviter = getUser(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = inviteCustomerUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
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

  return c.json({ success: true });
});

export { customersRouter };
