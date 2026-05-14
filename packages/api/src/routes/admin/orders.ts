import { Hono } from "hono";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { db } from "../../db/connection";
import { orders, orderItems, customers } from "../../db/schema/index";
import { sendOrderStatusChange } from "../../services/email";
import type { AppEnv } from "../../types";
import type { OrderStatus } from "@kava-now/shared";

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

// GET / — list orders with filters
ordersRouter.get("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const status = c.req.query("status") as OrderStatus | undefined;
  const customerId = c.req.query("customerId");
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");

  const conditions: ReturnType<typeof eq>[] = [eq(orders.kavaId, kavaId)];

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

  const rows = await db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      status: orders.status,
      notes: orders.notes,
      createdAt: orders.createdAt,
      customerName: customers.name,
      itemCount: sql<number>`count(${orderItems.id})::int`,
      total: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}::numeric), 0)::numeric`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(and(...conditions))
    .groupBy(orders.id, customers.name)
    .orderBy(sql`${orders.createdAt} desc`);

  return c.json(rows);
});

// GET /:id — order detail with items and customer info
ordersRouter.get("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
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
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.id, id), eq(orders.kavaId, kavaId)))
    .limit(1);

  if (!order) {
    return c.json({ error: "Η παραγγελία δεν βρέθηκε" }, 404);
  }

  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, id));

  const total = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);

  return c.json({ ...order, items, total });
});

// PUT /:id/status — update order status
ordersRouter.put("/:id/status", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const newStatus = body.status as OrderStatus;

  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return c.json({ error: "Μη έγκυρη κατάσταση" }, 400);
  }

  // Get current order
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.kavaId, kavaId)))
    .limit(1);

  if (!order) {
    return c.json({ error: "Η παραγγελία δεν βρέθηκε" }, 404);
  }

  // Validate transition
  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    return c.json(
      {
        error: `Δεν επιτρέπεται η μετάβαση από "${order.status}" σε "${newStatus}"`,
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

export { ordersRouter };
