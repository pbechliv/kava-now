import { validationError } from "../../validation";
import { Hono } from "hono";
import { eq, and, desc, sql, inArray, gte, lte } from "drizzle-orm";
import {
  createOrderSchema,
  customerOrdersQuerySchema,
  API_ERROR_CODES,
  type CustomerOrderListItem,
  type CustomerOrderDetailResponse,
  type CreateOrderResponse,
  type ReorderPreviewItem,
  type ReorderPreviewResponse,
  type PaginatedResponse,
} from "@kava-now/shared";
import { afterTenantCommit, db } from "../../db/connection";
import {
  orders,
  orderItems,
  products,
  categories,
  customers,
  customerBrandPricing,
} from "../../db/schema/index";
import { requireCustomerProfile } from "../../middleware/require-customer-profile";
import { resolvePrice } from "../../services/pricing";
import { allocateOrderNumber } from "../../services/orders";
import { sendPushToUsers, orderNotificationRecipients } from "../../services/push";
import type { AppEnv } from "../../types";
import type { PreSerialize } from "../../serialize";
import { getCustomerId, getTenant, getTenantId } from "../../context";

const ordersRouter = new Hono<AppEnv>();

ordersRouter.use("*", requireCustomerProfile);

// Post-commit push (no email — order emails were removed; email is now only for
// user management) to the customer's assigned users and anyone opted into
// all-order notifications (#28). Recipients are resolved NOW — inside the
// request transaction — because customer_assigned_users is RLS-scoped and the
// post-commit callback runs on the base pool with no tenant context. The
// dispatch itself is deferred so a rolled-back order never notifies anyone.
async function queueOrderPlacedNotifications(
  tenant: { id: string; slug: string },
  customer: { id: string; name: string },
  result: {
    order: { id: string; orderNumber: number };
    items: { id: string }[];
  },
  actingUserId: string | undefined,
): Promise<void> {
  // Exclude the user who placed the order — never notify someone of their own action.
  const recipientIds = await orderNotificationRecipients(tenant.id, customer.id, actingUserId);
  if (recipientIds.length === 0) return; // nobody assigned, nobody opted in

  return afterTenantCommit(async () => {
    try {
      await sendPushToUsers(recipientIds, {
        title: `Νέα παραγγελία #${result.order.orderNumber}`,
        body: `${customer.name} — ${result.items.length} είδη`,
        url: `/k/${tenant.slug}/admin/orders/${result.order.id}`,
      });
    } catch (err) {
      console.error("[push] order-placed push failed:", err);
    }
  });
}

// POST / — create order
ordersRouter.post("/", async (c) => {
  const tenant = getTenant(c);
  const customerId = getCustomerId(c);

  const body = await c.req.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const { items, notes, requestedDeliveryDate, poReference } = parsed.data;
  const productIds = items.map((i) => i.productId);

  // Verify all products are active. Explicit tenantId filters here (and
  // below) are defense-in-depth on top of RLS.
  const activeProducts = await db
    .select({
      id: products.id,
      basePrice: products.basePrice,
      name: products.name,
      brand: products.brand,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenant.id),
        eq(products.active, true),
        inArray(products.id, productIds),
      ),
    );

  const productMap = new Map(activeProducts.map((p) => [p.id, p]));

  // Check all requested products exist and are active. Report every offending
  // id (not just the first) so the cart can flag each unavailable line by name.
  const unavailableProductIds = items
    .filter((item) => !productMap.has(item.productId))
    .map((item) => item.productId);
  if (unavailableProductIds.length > 0) {
    return c.json(
      {
        code: API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
        error: `Products not available: ${unavailableProductIds.join(", ")}`,
        unavailableProductIds,
      },
      400,
    );
  }

  // Get customer info and brand pricing
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenant.id)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const brandPricing = await db
    .select({
      brand: customerBrandPricing.brand,
      discountPct: customerBrandPricing.discountPct,
    })
    .from(customerBrandPricing)
    .where(
      and(
        eq(customerBrandPricing.customerId, customerId),
        eq(customerBrandPricing.tenantId, tenant.id),
      ),
    );

  const brandDiscountMap = new Map(brandPricing.map((bp) => [bp.brand, bp.discountPct]));

  // Create order + items in transaction
  const result = await db.transaction(async (tx) => {
    const orderNumber = await allocateOrderNumber(tx, tenant.id);
    const [order] = await tx
      .insert(orders)
      .values({
        tenantId: tenant.id,
        customerId,
        orderNumber,
        notes: notes || null,
        requestedDeliveryDate: requestedDeliveryDate || null,
        poReference: poReference || null,
      })
      .returning();

    if (!order) throw new Error("Failed to create order");

    const itemValues = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} is not available`);
      const unitPrice = resolvePrice(
        product.basePrice,
        brandDiscountMap.get(product.brand) ?? null,
      );

      return {
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        originalQuantity: item.quantity,
        unitPrice: String(unitPrice),
        productName: product.name,
      };
    });

    const createdItems = await tx.insert(orderItems).values(itemValues).returning();

    return { order, items: createdItems };
  });

  await queueOrderPlacedNotifications(tenant, customer, result, c.get("user")?.id);

  const responseBody = result satisfies PreSerialize<CreateOrderResponse>;
  return c.json(responseBody, 201);
});

// GET / — list orders for authenticated customer
ordersRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);
  const customerId = getCustomerId(c);

  const parsed = customerOrdersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }
  const { status, dateFrom, dateTo, page, pageSize } = parsed.data;

  const conditions = [eq(orders.tenantId, tenantId), eq(orders.customerId, customerId)];
  if (status) {
    conditions.push(eq(orders.status, status));
  }
  if (dateFrom) {
    conditions.push(gte(orders.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    // Include the entire dateTo day (mirrors the admin orders list).
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
      orderNumber: orders.orderNumber,
      status: orders.status,
      notes: orders.notes,
      createdAt: orders.createdAt,
      itemCount: sql<number>`(count(${orderItems.id}) filter (where ${orderItems.status} = 'active'))::int`,
      // Totals contract: JSON number, 2 decimals — sum in numeric (exact),
      // round, then one float8 cast.
      totalAmount: sql<number>`coalesce(round(sum(${orderItems.unitPrice}::numeric * ${orderItems.quantity}) filter (where ${orderItems.status} = 'active'), 2), 0)::float8`,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(whereClause)
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const body = {
    data: rows,
    total,
    page,
    pageSize,
  } satisfies PreSerialize<PaginatedResponse<CustomerOrderListItem>>;
  return c.json(body);
});

// GET /:id — single order with items
ordersRouter.get("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const customerId = getCustomerId(c);
  const orderId = c.req.param("id");

  // Explicit columns: the full row carries ERP internals (erpMark, the
  // transmitting staff member's UUID) and tenantId — none of the customer's
  // business.
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      notes: orders.notes,
      requestedDeliveryDate: orders.requestedDeliveryDate,
      poReference: orders.poReference,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(eq(orders.id, orderId), eq(orders.tenantId, tenantId), eq(orders.customerId, customerId)),
    )
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
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const body = { ...order, items } satisfies PreSerialize<CustomerOrderDetailResponse>;
  return c.json(body);
});

// GET /:id/reorder — re-resolve a past order's active lines against the current
// catalog + pricing and return them as a cart-ready preview (#172). It does NOT
// place an order: the customer loads these into the cart, reviews (edit "same as
// last week minus the kegs", see what's no longer available), and submits
// normally. Dropped lines (deactivated/removed products) are named, not silently
// discarded as the old instant-reorder did.
ordersRouter.get("/:id/reorder", async (c) => {
  const tenantId = getTenantId(c);
  const customerId = getCustomerId(c);
  const orderId = c.req.param("id");

  const [originalOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.id, orderId), eq(orders.tenantId, tenantId), eq(orders.customerId, customerId)),
    )
    .limit(1);

  if (!originalOrder) {
    return c.json({ error: "Order not found" }, 404);
  }

  // Active lines only, in their original order — cancelled/replaced lines never
  // reappear in a reorder.
  const originalItems = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "active")));

  if (originalItems.length === 0) {
    return c.json({ code: API_ERROR_CODES.ORDER_EMPTY, error: "Order has no items" }, 400);
  }

  const productIds = originalItems.map((i) => i.productId);

  // Full catalog shape for each product, so the client can drop these straight
  // into the cart (which stores CatalogProduct). categoryName via left join.
  const catalogRows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      description: products.description,
      imageUrl: products.imageUrl,
      unit: products.unit,
      volumeMl: products.volumeMl,
      alcoholPct: products.alcoholPct,
      categoryId: products.categoryId,
      categoryName: categories.name,
      basePrice: products.basePrice,
      active: products.active,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));

  const productMap = new Map(catalogRows.map((p) => [p.id, p]));

  const brandPricing = await db
    .select({
      brand: customerBrandPricing.brand,
      discountPct: customerBrandPricing.discountPct,
    })
    .from(customerBrandPricing)
    .where(
      and(
        eq(customerBrandPricing.customerId, customerId),
        eq(customerBrandPricing.tenantId, tenantId),
      ),
    );

  const brandDiscountMap = new Map(brandPricing.map((bp) => [bp.brand, bp.discountPct]));

  const items: ReorderPreviewItem[] = [];
  const dropped: { productName: string }[] = [];

  for (const item of originalItems) {
    const product = productMap.get(item.productId);
    if (!product || !product.active) {
      // Use the line's historical name — the product row may be gone/renamed.
      dropped.push({ productName: item.productName });
      continue;
    }
    items.push({
      product: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        description: product.description,
        imageUrl: product.imageUrl,
        unit: product.unit,
        volumeMl: product.volumeMl,
        alcoholPct: product.alcoholPct,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        resolvedPrice: resolvePrice(product.basePrice, brandDiscountMap.get(product.brand) ?? null),
      },
      quantity: item.quantity,
    });
  }

  if (items.length === 0) {
    return c.json(
      {
        code: API_ERROR_CODES.ORIGINAL_ITEMS_UNAVAILABLE,
        error: "None of the original order items are still available",
      },
      400,
    );
  }

  const body = { items, dropped } satisfies PreSerialize<ReorderPreviewResponse>;
  return c.json(body);
});

// POST /:id/cancel — customer cancels their own order.
//   pending   → immediate cancellation (cancelled_by_customer)
//   confirmed → cancellation request (cancellation_requested), staff resolve it
// Anything else (shipped/delivered/already cancelled, or ERP-transmitted) is
// locked. Either outcome notifies staff (assigned users + all-order opt-ins).
ordersRouter.post("/:id/cancel", async (c) => {
  const tenant = getTenant(c);
  const tenantId = tenant.id;
  const customerId = getCustomerId(c);
  const orderId = c.req.param("id");
  const actingUserId = c.get("user")?.id;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status, erpStatus: orders.erpStatus })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.tenantId, tenantId),
          eq(orders.customerId, customerId),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) return { kind: "not_found" as const };

    // A transmitted order is hard-locked regardless of fulfillment status.
    if (order.erpStatus === "transmitted") return { kind: "locked_erp" as const };

    let nextStatus: "cancelled_by_customer" | "cancellation_requested";
    if (order.status === "pending") nextStatus = "cancelled_by_customer";
    else if (order.status === "confirmed") nextStatus = "cancellation_requested";
    else return { kind: "locked_status" as const };

    const [updated] = await tx
      .update(orders)
      .set({ status: nextStatus })
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .returning({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status });

    if (!updated) return { kind: "not_found" as const };

    // Resolve recipients + customer name inside the tenant tx (RLS-scoped);
    // the push itself is deferred post-commit so a rollback notifies no one.
    const [customer] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);
    const recipientIds = await orderNotificationRecipients(tenantId, customerId, actingUserId);

    return { kind: "ok" as const, updated, recipientIds, customerName: customer?.name ?? "" };
  });

  if (result.kind === "not_found") return c.json({ error: "Order not found" }, 404);
  if (result.kind === "locked_erp") {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_LOCKED_BY_ERP,
        error: "Order has already been transmitted to ERP and cannot be cancelled",
      },
      409,
    );
  }
  if (result.kind === "locked_status") {
    return c.json(
      {
        code: API_ERROR_CODES.ORDER_LOCKED_BY_STATUS,
        error: "Order cannot be cancelled in its current status",
      },
      409,
    );
  }

  if (result.recipientIds.length > 0) {
    const requested = result.updated.status === "cancellation_requested";
    await afterTenantCommit(async () => {
      try {
        await sendPushToUsers(result.recipientIds, {
          title: requested ? "Αίτημα ακύρωσης" : "Ακύρωση παραγγελίας",
          body: `${result.customerName} — #${result.updated.orderNumber}`,
          url: `/k/${tenant.slug}/admin/orders/${result.updated.id}`,
        });
      } catch (err) {
        console.error("[push] order-cancel push failed:", err);
      }
    });
  }

  return c.json(result.updated);
});

// POST /:id/withdraw-cancellation — customer takes back a pending cancellation
// request (#176). Only cancellation_requested qualifies; the request can only
// have come from a confirmed order, so the order returns to confirmed. Staff
// are notified so they don't act on a request that no longer exists.
ordersRouter.post("/:id/withdraw-cancellation", async (c) => {
  const tenant = getTenant(c);
  const tenantId = tenant.id;
  const customerId = getCustomerId(c);
  const orderId = c.req.param("id");
  const actingUserId = c.get("user")?.id;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.tenantId, tenantId),
          eq(orders.customerId, customerId),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) return { kind: "not_found" as const };
    if (order.status !== "cancellation_requested") return { kind: "not_requested" as const };

    const [updated] = await tx
      .update(orders)
      .set({ status: "confirmed" })
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .returning({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status });

    if (!updated) return { kind: "not_found" as const };

    const [customer] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);
    const recipientIds = await orderNotificationRecipients(tenantId, customerId, actingUserId);

    return { kind: "ok" as const, updated, recipientIds, customerName: customer?.name ?? "" };
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
    await afterTenantCommit(async () => {
      try {
        await sendPushToUsers(result.recipientIds, {
          title: "Ανάκληση αιτήματος ακύρωσης",
          body: `${result.customerName} — #${result.updated.orderNumber}`,
          url: `/k/${tenant.slug}/admin/orders/${result.updated.id}`,
        });
      } catch (err) {
        console.error("[push] cancellation-withdrawal push failed:", err);
      }
    });
  }

  return c.json(result.updated);
});

export { ordersRouter };
