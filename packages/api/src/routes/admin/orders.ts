import { Hono } from "hono";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { db } from "../../db/connection";
import {
  orders,
  orderItems,
  customers,
  products,
  users,
  customerBrandPricing,
} from "../../db/schema/index";
import { sendOrderStatusChange } from "../../services/email";
import { logAudit } from "../../services/audit";
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

type MutableGuard =
  | { ok: true }
  | { ok: false; code: ApiErrorCode; error: string };

function assertOrderMutable(order: {
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

  // Get current order
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  // Validate transition
  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_INVALID_STATUS,
        error: `Status transition not allowed: "${order.status}" → "${newStatus}"`,
      },
      400,
    );
  }

  // Update status
  const [updated] = await db
    .update(orders)
    .set({ status: newStatus })
    .where(eq(orders.id, id))
    .returning();

  // Send email to customer
  const [customer] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);

  if (customer?.email) {
    try {
      await sendOrderStatusChange(customer.email, { id }, newStatus);
    } catch (err) {
      console.error("[orders] Failed to send status change email:", err);
    }
  }

  return c.json(updated);
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

  if (existing.erpStatus === "transmitted") {
    return c.json({ code: API_ERROR_CODES.ORDER_ALREADY_TRANSMITTED, error: "Order already transmitted to ERP" }, 409);
  }

  const [updated] = await db
    .update(orders)
    .set({
      erpStatus: "transmitted",
      erpMark: parsed.data.mark,
      erpTransmittedAt: new Date(),
      erpTransmittedBy: user.id,
    })
    .where(eq(orders.id, id))
    .returning();

  await logAudit(c, {
    action: "order.erp.transmitted",
    targetType: "order",
    targetId: id,
    metadata: { mark: parsed.data.mark },
  });

  return c.json(updated);
});

async function resolveProductPriceForOrder(
  tenantId: string,
  customerId: string,
  productId: string,
) {
  const [product] = await db
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

  const [pricing] = await db
    .select({ discountPct: customerBrandPricing.discountPct })
    .from(customerBrandPricing)
    .where(
      and(
        eq(customerBrandPricing.customerId, customerId),
        eq(customerBrandPricing.brand, product.brand),
      ),
    )
    .limit(1);

  const unitPrice = resolvePrice(product.basePrice, pricing?.discountPct ?? null);
  return { product, unitPrice };
}

async function loadOrderForMutation(tenantId: string, id: string) {
  const [order] = await db
    .select({
      id: orders.id,
      tenantId: orders.tenantId,
      customerId: orders.customerId,
      status: orders.status,
      erpStatus: orders.erpStatus,
    })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);
  return order ?? null;
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

  const order = await loadOrderForMutation(tenantId, id);
  if (!order) return c.json({ error: "Order not found" }, 404);
  const guard = assertOrderMutable(order);
  if (!guard.ok) return c.json({ code: guard.code, error: guard.error }, 409);

  const resolved = await resolveProductPriceForOrder(
    tenantId,
    order.customerId,
    parsed.data.productId,
  );
  if (!resolved) return c.json({ code: API_ERROR_CODES.PRODUCT_NOT_AVAILABLE, error: "Product is not available" }, 400);

  const inserted = await db.transaction(async (tx) => {
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
    return item;
  });

  await logAudit(c, {
    action: "order.item.added",
    targetType: "order",
    targetId: id,
    metadata: {
      itemId: inserted?.id,
      productId: resolved.product.id,
      productName: resolved.product.name,
      quantity: parsed.data.quantity,
      unitPrice: resolved.unitPrice,
    },
  });

  return c.json(inserted, 201);
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

  const order = await loadOrderForMutation(tenantId, id);
  if (!order) return c.json({ error: "Order not found" }, 404);
  const guard = assertOrderMutable(order);
  if (!guard.ok) return c.json({ code: guard.code, error: guard.error }, 409);

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
    .limit(1);
  if (!item) return c.json({ error: "Order item not found" }, 404);
  if (item.status === "cancelled") {
    return c.json({ code: API_ERROR_CODES.ORDER_ITEM_CANCELLED, error: "Order item is cancelled" }, 409);
  }

  const updated = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(orderItems)
      .set({ quantity: parsed.data.quantity })
      .where(eq(orderItems.id, itemId))
      .returning();
    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));
    return u;
  });

  await logAudit(c, {
    action: "order.item.quantityUpdated",
    targetType: "order",
    targetId: id,
    metadata: {
      itemId,
      productName: item.productName,
      oldQuantity: item.quantity,
      newQuantity: parsed.data.quantity,
    },
  });

  return c.json(updated);
});

// POST /:id/items/:itemId/cancel — soft-cancel a line item
ordersRouter.post("/:id/items/:itemId/cancel", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");

  const order = await loadOrderForMutation(tenantId, id);
  if (!order) return c.json({ error: "Order not found" }, 404);
  const guard = assertOrderMutable(order);
  if (!guard.ok) return c.json({ code: guard.code, error: guard.error }, 409);

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
    .limit(1);
  if (!item) return c.json({ error: "Order item not found" }, 404);
  if (item.status === "cancelled") {
    return c.json({ code: API_ERROR_CODES.ORDER_ITEM_CANCELLED, error: "Order item is already cancelled" }, 409);
  }

  const cancelled = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(orderItems)
      .set({ status: "cancelled" })
      .where(eq(orderItems.id, itemId))
      .returning();
    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));
    return u;
  });

  await logAudit(c, {
    action: "order.item.cancelled",
    targetType: "order",
    targetId: id,
    metadata: {
      itemId,
      productName: item.productName,
      quantity: item.quantity,
    },
  });

  return c.json(cancelled);
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

  const order = await loadOrderForMutation(tenantId, id);
  if (!order) return c.json({ error: "Order not found" }, 404);
  const guard = assertOrderMutable(order);
  if (!guard.ok) return c.json({ code: guard.code, error: guard.error }, 409);

  const [existing] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
    .limit(1);
  if (!existing) return c.json({ error: "Order item not found" }, 404);
  if (existing.status === "cancelled") {
    return c.json({ code: API_ERROR_CODES.ORDER_ITEM_CANCELLED, error: "Order item is already cancelled" }, 409);
  }

  const resolved = await resolveProductPriceForOrder(
    tenantId,
    order.customerId,
    parsed.data.productId,
  );
  if (!resolved) return c.json({ code: API_ERROR_CODES.REPLACEMENT_PRODUCT_NOT_AVAILABLE, error: "Replacement product is not available" }, 400);

  const result = await db.transaction(async (tx) => {
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

    return { newItem };
  });

  await logAudit(c, {
    action: "order.item.replaced",
    targetType: "order",
    targetId: id,
    metadata: {
      oldItemId: itemId,
      oldProductName: existing.productName,
      oldQuantity: existing.quantity,
      newItemId: result.newItem.id,
      newProductId: resolved.product.id,
      newProductName: resolved.product.name,
      newQuantity: parsed.data.quantity,
      newUnitPrice: resolved.unitPrice,
    },
  });

  return c.json(result.newItem, 201);
});

export { ordersRouter };
