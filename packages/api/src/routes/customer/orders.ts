import { Hono } from "hono";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { createOrderSchema, paginationQuerySchema, API_ERROR_CODES } from "@kava-now/shared";
import { db } from "../../db/connection";
import {
  orders,
  orderItems,
  products,
  customers,
  customerBrandPricing,
} from "../../db/schema/index";
import { resolvePrice } from "../../services/pricing";
import { sendOrderNotification } from "../../services/email";
import type { AppEnv } from "../../types";

const ordersRouter = new Hono<AppEnv>();

// POST / — create order
ordersRouter.post("/", async (c) => {
  const tenant = c.get("tenant")!;
  const customerId = c.get("membership")!.customerId;

  if (!customerId) {
    return c.json(
      {
        code: API_ERROR_CODES.CUSTOMER_PROFILE_MISSING,
        error: "Customer profile not linked to this user",
      },
      400,
    );
  }

  const body = await c.req.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { items, notes } = parsed.data;
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

  // Check all requested products exist and are active
  for (const item of items) {
    if (!productMap.has(item.productId)) {
      return c.json(
        {
          code: API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
          error: `Product ${item.productId} is not available`,
        },
        400,
      );
    }
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
    const [order] = await tx
      .insert(orders)
      .values({
        tenantId: tenant.id,
        customerId,
        notes: notes || null,
      })
      .returning();

    if (!order) throw new Error("Failed to create order");

    const itemValues = items.map((item) => {
      const product = productMap.get(item.productId)!;
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

  // Send notification email (fire and forget)
  sendOrderNotification(tenant, customer, result.order, result.items).catch((err) =>
    console.error("[email] Failed to send order notification:", err),
  );

  return c.json(result, 201);
});

// GET / — list orders for authenticated customer
ordersRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.get("membership")!.customerId;

  if (!customerId) {
    return c.json(
      {
        code: API_ERROR_CODES.CUSTOMER_PROFILE_MISSING,
        error: "Customer profile not linked to this user",
      },
      400,
    );
  }

  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const whereClause = and(eq(orders.tenantId, tenantId), eq(orders.customerId, customerId));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(whereClause);
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      id: orders.id,
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

  return c.json({ data: rows, total, page, pageSize });
});

// GET /:id — single order with items
ordersRouter.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.get("membership")!.customerId;
  const orderId = c.req.param("id");

  if (!customerId) {
    return c.json(
      {
        code: API_ERROR_CODES.CUSTOMER_PROFILE_MISSING,
        error: "Customer profile not linked to this user",
      },
      400,
    );
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.id, orderId), eq(orders.tenantId, tenantId), eq(orders.customerId, customerId)),
    )
    .limit(1);

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  return c.json({ ...order, items });
});

// POST /:id/reorder — clone items from referenced order into a new order
ordersRouter.post("/:id/reorder", async (c) => {
  const tenant = c.get("tenant")!;
  const customerId = c.get("membership")!.customerId;
  const orderId = c.req.param("id");

  if (!customerId) {
    return c.json(
      {
        code: API_ERROR_CODES.CUSTOMER_PROFILE_MISSING,
        error: "Customer profile not linked to this user",
      },
      400,
    );
  }

  // Get original order
  const [originalOrder] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, tenant.id),
        eq(orders.customerId, customerId),
      ),
    )
    .limit(1);

  if (!originalOrder) {
    return c.json({ error: "Order not found" }, 404);
  }

  // Get original items
  const originalItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  if (originalItems.length === 0) {
    return c.json({ code: API_ERROR_CODES.ORDER_EMPTY, error: "Order has no items" }, 400);
  }

  const productIds = originalItems.map((i) => i.productId);

  // Get current product data
  const activeProducts = await db
    .select({
      id: products.id,
      basePrice: products.basePrice,
      name: products.name,
      brand: products.brand,
      active: products.active,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenant.id), inArray(products.id, productIds)));

  const productMap = new Map(activeProducts.map((p) => [p.id, p]));

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

  // Skip cancelled items and products no longer available
  const validItems = originalItems.filter((item) => {
    if (item.status !== "active") return false;
    const product = productMap.get(item.productId);
    return product && product.active;
  });

  if (validItems.length === 0) {
    return c.json(
      {
        code: API_ERROR_CODES.ORIGINAL_ITEMS_UNAVAILABLE,
        error: "None of the original order items are still available",
      },
      400,
    );
  }

  // Create new order with re-resolved prices
  const result = await db.transaction(async (tx) => {
    const [newOrder] = await tx
      .insert(orders)
      .values({
        tenantId: tenant.id,
        customerId,
      })
      .returning();

    if (!newOrder) throw new Error("Failed to create order");

    const itemValues = validItems.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = resolvePrice(
        product.basePrice,
        brandDiscountMap.get(product.brand) ?? null,
      );

      return {
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        originalQuantity: item.quantity,
        unitPrice: String(unitPrice),
        productName: product.name,
      };
    });

    const createdItems = await tx.insert(orderItems).values(itemValues).returning();

    return { order: newOrder, items: createdItems };
  });

  // Send notification email (fire and forget)
  sendOrderNotification(tenant, customer, result.order, result.items).catch((err) =>
    console.error("[email] Failed to send order notification:", err),
  );

  return c.json(result, 201);
});

export { ordersRouter };
