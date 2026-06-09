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
import { sendOrderStatusChange } from "../../services/email";
import { resolvePrice } from "../../services/pricing";
import type { AppEnv } from "../../types";
import {
  paginationQuerySchema,
  markOrderTransmittedSchema,
  addOrderItemSchema,
  updateOrderItemSchema,
  replaceOrderItemSchema,
  API_ERROR_CODES,
  type ApiErrorCode,
  type OrderStatus,
  type ErpStatus,
} from "@kava-now/shared";

const ordersRouter = new Hono<AppEnv>();

const VALID_STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

// Status transition rules: key = current, value = allowed next statuses
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [], // terminal
  cancelled: [], // terminal
};

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
  const tenantId = c.get("tenantId")!;
  const status = c.req.query("status") as OrderStatus | undefined;
  const customerId = c.req.query("customerId");
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");

  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const conditions: ReturnType<typeof eq>[] = [eq(orders.tenantId, tenantId)];

  if (status && VALID_STATUSES.includes(status)) {
    conditions.push(eq(orders.status, status));
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
      total: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}::numeric) filter (where ${orderItems.status} = 'active'), 0)::numeric`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(whereClause)
    .groupBy(orders.id, customers.name)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({ data: rows, total, page, pageSize });
});

// GET /:id — order detail with items and customer info
ordersRouter.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");

  const [order] = await db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      status: orders.status,
      notes: orders.notes,
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

  const items = await db
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

  const total = items.reduce(
    (sum, item) => (item.status === "active" ? sum + Number(item.unitPrice) * item.quantity : sum),
    0,
  );

  return c.json({ ...order, items, total });
});

// PUT /:id/status — update order status
ordersRouter.put("/:id/status", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const newStatus = body.status as OrderStatus;

  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return c.json({ error: "Invalid status", code: API_ERROR_CODES.ORDER_INVALID_STATUS }, 400);
  }

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

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      return { kind: "invalid_transition" as const, from: order.status };
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
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

  // Notify the customer after the request transaction commits (#47): the
  // FOR UPDATE lock above survives the inner savepoint and is only released
  // at the outer COMMIT — awaiting SMTP here would hold the order row locked
  // (and pin a pool connection) for the whole mail round-trip.
  const [customer] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(and(eq(customers.id, result.customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (customer?.email) {
    const customerEmail = customer.email;
    await afterTenantCommit(async () => {
      try {
        await sendOrderStatusChange(customerEmail, { id }, newStatus);
      } catch (err) {
        console.error("[orders] Failed to send status change email:", err);
      }
    });
  }

  return c.json(result.updated);
});

// PATCH /:id/erp — mark an order as transmitted to the ERP, store the AADE MARK
ordersRouter.patch("/:id/erp", async (c) => {
  const tenantId = c.get("tenantId")!;
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = markOrderTransmittedSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [existing] = await db
    .select({ erpStatus: orders.erpStatus })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Order not found" }, 404);
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
  const tenantId = c.get("tenantId")!;
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
  const tenantId = c.get("tenantId")!;
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
  const tenantId = c.get("tenantId")!;
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
  const tenantId = c.get("tenantId")!;
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
