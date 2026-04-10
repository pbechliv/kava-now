import { Hono } from "hono";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { createOrderSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import {
  orders,
  orderItems,
  products,
  customerProducts,
  customers,
  pricingTiers,
} from "../../db/schema/index";
import { resolvePrice } from "../../services/pricing";
import { sendOrderNotification } from "../../services/email";
import type { AppEnv } from "../../types";

const ordersRouter = new Hono<AppEnv>();

// POST / — create order
ordersRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const kava = c.get("kava")!;
  const customerId = user.customerId;

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  const body = await c.req.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { items, notes } = parsed.data;
  const productIds = items.map((i) => i.productId);

  // Verify all products are assigned to this customer and are active
  const assignedProducts = await db
    .select({
      productId: customerProducts.productId,
      customPrice: customerProducts.customPrice,
      basePrice: products.basePrice,
      productName: products.name,
    })
    .from(customerProducts)
    .innerJoin(products, eq(customerProducts.productId, products.id))
    .where(
      and(
        eq(customerProducts.customerId, customerId),
        eq(customerProducts.active, true),
        eq(products.active, true),
        inArray(customerProducts.productId, productIds),
      ),
    );

  const assignedMap = new Map(
    assignedProducts.map((p) => [p.productId, p]),
  );

  // Check all requested products exist in assigned set
  for (const item of items) {
    if (!assignedMap.has(item.productId)) {
      return c.json(
        {
          error: `Το προϊόν ${item.productId} δεν είναι διαθέσιμο στον κατάλογό σας`,
        },
        400,
      );
    }
  }

  // Get customer's pricing tier discount
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      discountPct: pricingTiers.discountPct,
    })
    .from(customers)
    .leftJoin(pricingTiers, eq(customers.pricingTierId, pricingTiers.id))
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  // Create order + items in transaction
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        kavaId: kava.id,
        customerId,
        notes: notes || null,
      })
      .returning();

    if (!order) throw new Error("Failed to create order");

    const itemValues = items.map((item) => {
      const assigned = assignedMap.get(item.productId)!;
      const unitPrice = resolvePrice(
        assigned.basePrice,
        customer.discountPct,
        assigned.customPrice,
      );

      return {
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: String(unitPrice),
        productName: assigned.productName,
      };
    });

    const createdItems = await tx
      .insert(orderItems)
      .values(itemValues)
      .returning();

    return { order, items: createdItems };
  });

  // Send notification email (fire and forget)
  sendOrderNotification(kava, customer, result.order, result.items).catch(
    (err) => console.error("[email] Failed to send order notification:", err),
  );

  return c.json(result, 201);
});

// GET / — list orders for authenticated customer
ordersRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const customerId = user.customerId;

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      notes: orders.notes,
      createdAt: orders.createdAt,
      itemCount: sql<number>`count(${orderItems.id})::int`,
      totalAmount: sql<number>`coalesce(sum(${orderItems.unitPrice}::numeric * ${orderItems.quantity}), 0)::float`,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(eq(orders.customerId, customerId))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt));

  return c.json(rows);
});

// GET /:id — single order with items
ordersRouter.get("/:id", async (c) => {
  const user = c.get("user")!;
  const customerId = user.customerId;
  const orderId = c.req.param("id");

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
    .limit(1);

  if (!order) {
    return c.json({ error: "Η παραγγελία δεν βρέθηκε" }, 404);
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return c.json({ ...order, items });
});

// POST /:id/reorder — clone items from referenced order into a new order
ordersRouter.post("/:id/reorder", async (c) => {
  const user = c.get("user")!;
  const kava = c.get("kava")!;
  const customerId = user.customerId;
  const orderId = c.req.param("id");

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  // Get original order
  const [originalOrder] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
    .limit(1);

  if (!originalOrder) {
    return c.json({ error: "Η παραγγελία δεν βρέθηκε" }, 404);
  }

  // Get original items
  const originalItems = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (originalItems.length === 0) {
    return c.json({ error: "Η παραγγελία δεν περιέχει προϊόντα" }, 400);
  }

  const productIds = originalItems.map((i) => i.productId);

  // Get current product data and customer pricing
  const assignedProducts = await db
    .select({
      productId: customerProducts.productId,
      customPrice: customerProducts.customPrice,
      basePrice: products.basePrice,
      productName: products.name,
      active: products.active,
      cpActive: customerProducts.active,
    })
    .from(customerProducts)
    .innerJoin(products, eq(customerProducts.productId, products.id))
    .where(
      and(
        eq(customerProducts.customerId, customerId),
        inArray(customerProducts.productId, productIds),
      ),
    );

  const assignedMap = new Map(
    assignedProducts.map((p) => [p.productId, p]),
  );

  // Get customer's pricing tier discount
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      discountPct: pricingTiers.discountPct,
    })
    .from(customers)
    .leftJoin(pricingTiers, eq(customers.pricingTierId, pricingTiers.id))
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  // Filter out items for products no longer available
  const validItems = originalItems.filter((item) => {
    const assigned = assignedMap.get(item.productId);
    return assigned && assigned.active && assigned.cpActive;
  });

  if (validItems.length === 0) {
    return c.json(
      {
        error:
          "Κανένα προϊόν από την αρχική παραγγελία δεν είναι πλέον διαθέσιμο",
      },
      400,
    );
  }

  // Create new order with re-resolved prices
  const result = await db.transaction(async (tx) => {
    const [newOrder] = await tx
      .insert(orders)
      .values({
        kavaId: kava.id,
        customerId,
      })
      .returning();

    if (!newOrder) throw new Error("Failed to create order");

    const itemValues = validItems.map((item) => {
      const assigned = assignedMap.get(item.productId)!;
      const unitPrice = resolvePrice(
        assigned.basePrice,
        customer.discountPct,
        assigned.customPrice,
      );

      return {
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: String(unitPrice),
        productName: assigned.productName,
      };
    });

    const createdItems = await tx
      .insert(orderItems)
      .values(itemValues)
      .returning();

    return { order: newOrder, items: createdItems };
  });

  // Send notification email (fire and forget)
  sendOrderNotification(kava, customer, result.order, result.items).catch(
    (err) => console.error("[email] Failed to send order notification:", err),
  );

  return c.json(result, 201);
});

export { ordersRouter };
