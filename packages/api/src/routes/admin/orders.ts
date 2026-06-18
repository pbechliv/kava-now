import { Hono } from "hono";
import { eq, ne, and, sql, gte, lte, desc } from "drizzle-orm";
import { afterTenantCommit, db } from "../../db/connection";
import {
  orders,
  orderItems,
  customers,
  products,
  users,
  customerBrandPricing,
} from "../../db/schema/index";
import { resolvePrice } from "../../services/pricing";
import { customerUserRecipients, sendPushToUsers } from "../../services/push";
import type { AppEnv } from "../../types";
import type { PreSerialize } from "../../serialize";
import { getTenant, getTenantId, getUser } from "../../context";
import {
  adminOrdersQuerySchema,
  markOrderTransmittedSchema,
  updateOrderStatusSchema,
  updateOrderInternalNotesSchema,
  resolveCancellationRequestSchema,
  ORDER_STATUS_TRANSITIONS,
  addOrderItemSchema,
  updateOrderItemSchema,
  replaceOrderItemSchema,
  API_ERROR_CODES,
  type ApiErrorCode,
  type OrderStatus,
  type ErpStatus,
  type AdminOrderListItem,
  type AdminOrderItemWithProduct,
  type AdminOrderDetailResponse,
  type PaginatedResponse,
} from "@kava-now/shared";

const ordersRouter = new Hono<AppEnv>();

type MutableGuard = { ok: true } | { ok: false; code: ApiErrorCode; error: string };

// Exported for tests — the guard behind the ERP/fulfillment hard lock.
export function assertOrderMutable(order: {
  status: OrderStatus;
  erpStatus: ErpStatus;
}): MutableGuard {
  if (order.status !== "pending" && order.status !== "confirmed") {
    return {
      ok: false,
      code: API_ERROR_CODES.ORDER_LOCKED_BY_STATUS,
      error: "Order cannot be modified in its current status",
    };
  }
  if (order.erpStatus === "transmitted") {
    return {
      ok: false,
      code: API_ERROR_CODES.ORDER_LOCKED_BY_ERP,
      error: "Order has already been transmitted to ERP and cannot be modified",
    };
  }
  return { ok: true };
}

// GET / — list orders with filters
ordersRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);

  const parsed = adminOrdersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { status, erpStatus, customerId, dateFrom, dateTo, page, pageSize } = parsed.data;

  const conditions: ReturnType<typeof eq>[] = [eq(orders.tenantId, tenantId)];

  if (status) {
    conditions.push(eq(orders.status, status));
  }
  if (erpStatus) {
    conditions.push(eq(orders.erpStatus, erpStatus));
  }
  if (customerId) {
    conditions.push(eq(orders.customerId, customerId));
  }
  if (dateFrom) {
    conditions.push(gte(orders.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    // Include the entire dateTo day
    const endDate = new Date(dateTo);
    endDate.setDate(endDate.getDate() + 1);
    conditions.push(lte(orders.createdAt, endDate));
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(whereClause);
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      status: orders.status,
      notes: orders.notes,
      createdAt: orders.createdAt,
      customerName: customers.name,
      erpStatus: orders.erpStatus,
      itemCount: sql<number>`(count(${orderItems.id}) filter (where ${orderItems.status} = 'active'))::int`,
      // Totals contract: JSON number, 2 decimals. Sum exactly in numeric,
      // round, then one float8 cast — `::numeric` alone serializes as a
      // string through postgres-js, making the sql<number> type a lie.
      total: sql<number>`coalesce(round(sum(${orderItems.quantity} * ${orderItems.unitPrice}::numeric) filter (where ${orderItems.status} = 'active'), 2), 0)::float8`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(whereClause)
    .groupBy(orders.id, customers.name)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const body = {
    data: rows,
    total,
    page,
    pageSize,
  } satisfies PreSerialize<PaginatedResponse<AdminOrderListItem>>;
  return c.json(body);
});

// GET /:id — order detail with items and customer info
ordersRouter.get("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");

  const [order] = await db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      status: orders.status,
      notes: orders.notes,
      internalNotes: orders.internalNotes,
      createdAt: orders.createdAt,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerAddress: customers.address,
      customerVatId: customers.vatId,
      customerTaxOffice: customers.taxOffice,
      customerProfession: customers.profession,
      customerBillingAddress: customers.billingAddress,
      customerErpRef: customers.erpRef,
      erpStatus: orders.erpStatus,
      erpMark: orders.erpMark,
      erpTransmittedAt: orders.erpTransmittedAt,
      erpTransmittedBy: orders.erpTransmittedBy,
      erpTransmittedByName: users.name,
      erpTransmittedByEmail: users.email,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(users, eq(orders.erpTransmittedBy, users.id))
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const items: AdminOrderItemWithProduct[] = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      originalQuantity: orderItems.originalQuantity,
      unitPrice: orderItems.unitPrice,
      status: orderItems.status,
      replacedByItemId: orderItems.replacedByItemId,
      sku: products.sku,
      erpRef: products.erpRef,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, id));

  // Same totals contract as the list query: accumulate in integer cents so
  // float error can't creep in across many lines.
  const totalCents = items.reduce(
    (sum, item) =>
      item.status === "active"
        ? sum + Math.round(Number(item.unitPrice) * 100) * item.quantity
        : sum,
    0,
  );
  const total = totalCents / 100;

  const body = { ...order, items, total } satisfies PreSerialize<AdminOrderDetailResponse>;
  return c.json(body);
});

// PUT /:id/status — update order status
ordersRouter.put("/:id/status", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsedStatus = updateOrderStatusSchema.safeParse(body);
  if (!parsedStatus.success) {
    return c.json({ error: parsedStatus.error.flatten().fieldErrors }, 400);
  }
  const newStatus: OrderStatus = parsedStatus.data.status;

  // Read + validate + update in one transaction with the row locked, so two
  // concurrent transitions can't both pass validation against the same
  // SELECTed status (double-apply race).
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        customerId: orders.customerId,
      })
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .limit(1)
      .for("update");

    if (!order) {
      return { kind: "not_found" as const };
    }

    const allowed = ORDER_STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      return { kind: "invalid_transition" as const, from: order.status };
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: newStatus })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .returning();

    return { kind: "ok" as const, updated, customerId: order.customerId };
  });

  if (result.kind === "not_found") {
    return c.json({ error: "Order not found" }, 404);
  }
  if (result.kind === "invalid_transition") {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_INVALID_STATUS,
        error: `Status transition not allowed: "${result.from}" → "${newStatus}"`,
      },
      400,
    );
  }

  // Customers receive no order notifications (by design) — status changes are
  // visible in the customer's order views, not pushed/emailed.
  return c.json(result.updated);
});

// PATCH /:id/internal-notes — staff/owner-only note, never shown to customers.
// Editable regardless of the ERP/fulfillment hard lock: it's ops metadata, not
// order content. Empty string clears it (stored as NULL).
ordersRouter.patch("/:id/internal-notes", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateOrderInternalNotesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const trimmed = parsed.data.internalNotes?.trim();
  const [updated] = await db
    .update(orders)
    .set({ internalNotes: trimmed ? trimmed : null })
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .returning();

  if (!updated) {
    return c.json({ error: "Order not found" }, 404);
  }

  return c.json(updated);
});

// POST /:id/cancellation-request — staff approve/reject a customer's request to
// cancel a confirmed order. approve → cancelled_by_customer; reject → confirmed.
// Either way the customer is notified.
ordersRouter.post("/:id/cancellation-request", async (c) => {
  const tenant = getTenant(c);
  const tenantId = tenant.id;
  const actingUserId = getUser(c).id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = resolveCancellationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { decision } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status, customerId: orders.customerId })
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .limit(1)
      .for("update");

    if (!order) return { kind: "not_found" as const };
    if (order.status !== "cancellation_requested") return { kind: "not_requested" as const };

    const nextStatus = decision === "approve" ? "cancelled_by_customer" : "confirmed";
    const [updated] = await tx
      .update(orders)
      .set({ status: nextStatus })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .returning();

    // Resolve the customer's login users inside the tenant tx; push post-commit.
    const recipientIds = await customerUserRecipients(tenantId, order.customerId, actingUserId);
    return { kind: "ok" as const, updated, recipientIds };
  });

  if (result.kind === "not_found") return c.json({ error: "Order not found" }, 404);
  if (result.kind === "not_requested") {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_CANCELLATION_NOT_REQUESTED,
        error: "Order has no pending cancellation request",
      },
      409,
    );
  }

  if (result.recipientIds.length > 0) {
    const approved = decision === "approve";
    await afterTenantCommit(async () => {
      try {
        await sendPushToUsers(result.recipientIds, {
          title: approved ? "Η παραγγελία ακυρώθηκε" : "Το αίτημα ακύρωσης απορρίφθηκε",
          body: `#${id.slice(0, 8)}`,
          url: `/k/${tenant.slug}/orders/${id}`,
        });
      } catch (err) {
        console.error("[push] cancellation-resolution push failed:", err);
      }
    });
  }

  return c.json(result.updated);
});

// PATCH /:id/erp — mark an order as transmitted to the ERP, store the AADE MARK
ordersRouter.patch("/:id/erp", async (c) => {
  const tenantId = getTenantId(c);
  const user = getUser(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = markOrderTransmittedSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [existing] = await db
    .select({ erpStatus: orders.erpStatus, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Order not found" }, 404);
  }

  // ERP status is orthogonal to fulfillment EXCEPT for cancelled orders —
  // transmitting a cancelled (or cancellation-pending) order to AADE makes no
  // sense.
  if (
    existing.status === "cancelled" ||
    existing.status === "cancelled_by_customer" ||
    existing.status === "cancellation_requested"
  ) {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_LOCKED_BY_STATUS,
        error: "A cancelled or cancellation-pending order cannot be marked as transmitted",
      },
      409,
    );
  }

  // Atomic one-shot: the erp_status guard lives in the UPDATE's WHERE, so
  // two concurrent transmissions can't both succeed (and overwrite the MARK).
  const [updated] = await db
    .update(orders)
    .set({
      erpStatus: "transmitted",
      erpMark: parsed.data.mark,
      erpTransmittedAt: new Date(),
      erpTransmittedBy: user.id,
    })
    .where(
      and(eq(orders.id, id), eq(orders.tenantId, tenantId), ne(orders.erpStatus, "transmitted")),
    )
    .returning();

  if (!updated) {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_ALREADY_TRANSMITTED,
        error: "Order already transmitted to ERP",
      },
      409,
    );
  }

  return c.json(updated);
});

// Either the db proxy or an open transaction — item mutations run their reads
// and writes on the same transaction so the mutability guard can't race a
// concurrent ERP transmit / status change.
type DbOrTx = Pick<typeof db, "select" | "insert" | "update" | "delete">;

// A handler outcome computed inside a transaction, mapped to the HTTP
// response after commit.
type MutationFailure = { ok: false; status: 404 | 400 | 409; body: Record<string, unknown> };

async function resolveProductPriceForOrder(
  tx: DbOrTx,
  tenantId: string,
  customerId: string,
  productId: string,
) {
  const [product] = await tx
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      basePrice: products.basePrice,
      active: products.active,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product || !product.active) return null;

  const [pricing] = await tx
    .select({ discountPct: customerBrandPricing.discountPct })
    .from(customerBrandPricing)
    .where(
      and(
        eq(customerBrandPricing.tenantId, tenantId),
        eq(customerBrandPricing.customerId, customerId),
        eq(customerBrandPricing.brand, product.brand),
      ),
    )
    .limit(1);

  const unitPrice = resolvePrice(product.basePrice, pricing?.discountPct ?? null);
  return { product, unitPrice };
}

// Lock the order row (FOR UPDATE) and run the mutability guard. Must be
// called inside a transaction so the lock holds for the mutation.
async function lockOrderForMutation(tx: DbOrTx, tenantId: string, id: string) {
  const [order] = await tx
    .select({
      id: orders.id,
      tenantId: orders.tenantId,
      customerId: orders.customerId,
      status: orders.status,
      erpStatus: orders.erpStatus,
    })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1)
    .for("update");

  if (!order) {
    return { ok: false, status: 404, body: { error: "Order not found" } } satisfies MutationFailure;
  }
  const guard = assertOrderMutable(order);
  if (!guard.ok) {
    return {
      ok: false,
      status: 409,
      body: { code: guard.code, error: guard.error },
    } satisfies MutationFailure;
  }
  return { ok: true as const, order };
}

// POST /:id/items — add a new line item to an existing order
ordersRouter.post("/:id/items", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = addOrderItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const result = await db.transaction(async (tx) => {
    const lock = await lockOrderForMutation(tx, tenantId, id);
    if (!lock.ok) return lock;

    const resolved = await resolveProductPriceForOrder(
      tx,
      tenantId,
      lock.order.customerId,
      parsed.data.productId,
    );
    if (!resolved) {
      return {
        ok: false,
        status: 400,
        body: { code: API_ERROR_CODES.PRODUCT_NOT_AVAILABLE, error: "Product is not available" },
      } satisfies MutationFailure;
    }

    const [item] = await tx
      .insert(orderItems)
      .values({
        orderId: id,
        productId: resolved.product.id,
        quantity: parsed.data.quantity,
        originalQuantity: parsed.data.quantity,
        unitPrice: String(resolved.unitPrice),
        productName: resolved.product.name,
      })
      .returning();
    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));
    return { ok: true as const, item };
  });

  if (!result.ok) return c.json(result.body, result.status);
  return c.json(result.item, 201);
});

// PATCH /:id/items/:itemId — adjust quantity on an active line item
ordersRouter.patch("/:id/items/:itemId", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const body = await c.req.json();
  const parsed = updateOrderItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const result = await db.transaction(async (tx) => {
    const lock = await lockOrderForMutation(tx, tenantId, id);
    if (!lock.ok) return lock;

    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
      .limit(1);
    if (!item) {
      return {
        ok: false,
        status: 404,
        body: { error: "Order item not found" },
      } satisfies MutationFailure;
    }
    if (item.status === "cancelled") {
      return {
        ok: false,
        status: 409,
        body: { code: API_ERROR_CODES.ORDER_ITEM_CANCELLED, error: "Order item is cancelled" },
      } satisfies MutationFailure;
    }

    const [updated] = await tx
      .update(orderItems)
      .set({ quantity: parsed.data.quantity })
      .where(eq(orderItems.id, itemId))
      .returning();
    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));
    return { ok: true as const, updated };
  });

  if (!result.ok) return c.json(result.body, result.status);
  return c.json(result.updated);
});

// POST /:id/items/:itemId/cancel — soft-cancel a line item
ordersRouter.post("/:id/items/:itemId/cancel", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");

  const result = await db.transaction(async (tx) => {
    const lock = await lockOrderForMutation(tx, tenantId, id);
    if (!lock.ok) return lock;

    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
      .limit(1);
    if (!item) {
      return {
        ok: false,
        status: 404,
        body: { error: "Order item not found" },
      } satisfies MutationFailure;
    }
    if (item.status === "cancelled") {
      return {
        ok: false,
        status: 409,
        body: {
          code: API_ERROR_CODES.ORDER_ITEM_CANCELLED,
          error: "Order item is already cancelled",
        },
      } satisfies MutationFailure;
    }

    const [cancelled] = await tx
      .update(orderItems)
      .set({ status: "cancelled" })
      .where(eq(orderItems.id, itemId))
      .returning();
    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));
    return { ok: true as const, cancelled };
  });

  if (!result.ok) return c.json(result.body, result.status);
  return c.json(result.cancelled);
});

// POST /:id/items/:itemId/replace — swap a line item for a different product
ordersRouter.post("/:id/items/:itemId/replace", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const body = await c.req.json();
  const parsed = replaceOrderItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const result = await db.transaction(async (tx) => {
    const lock = await lockOrderForMutation(tx, tenantId, id);
    if (!lock.ok) return lock;

    const [existing] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
      .limit(1);
    if (!existing) {
      return {
        ok: false,
        status: 404,
        body: { error: "Order item not found" },
      } satisfies MutationFailure;
    }
    if (existing.status === "cancelled") {
      return {
        ok: false,
        status: 409,
        body: {
          code: API_ERROR_CODES.ORDER_ITEM_CANCELLED,
          error: "Order item is already cancelled",
        },
      } satisfies MutationFailure;
    }

    const resolved = await resolveProductPriceForOrder(
      tx,
      tenantId,
      lock.order.customerId,
      parsed.data.productId,
    );
    if (!resolved) {
      return {
        ok: false,
        status: 400,
        body: {
          code: API_ERROR_CODES.REPLACEMENT_PRODUCT_NOT_AVAILABLE,
          error: "Replacement product is not available",
        },
      } satisfies MutationFailure;
    }

    const [newItem] = await tx
      .insert(orderItems)
      .values({
        orderId: id,
        productId: resolved.product.id,
        quantity: parsed.data.quantity,
        originalQuantity: parsed.data.quantity,
        unitPrice: String(resolved.unitPrice),
        productName: resolved.product.name,
      })
      .returning();

    if (!newItem) throw new Error("Failed to insert replacement item");

    await tx
      .update(orderItems)
      .set({ status: "cancelled", replacedByItemId: newItem.id })
      .where(eq(orderItems.id, itemId));

    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));

    return { ok: true as const, newItem };
  });

  if (!result.ok) return c.json(result.body, result.status);
  return c.json(result.newItem, 201);
});

export { ordersRouter };
