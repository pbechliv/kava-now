import { Hono } from "hono";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { db } from "../../db/connection";
import { orders, orderItems, customers, products, users } from "../../db/schema/index";
import { sendOrderStatusChange } from "../../services/email";
import { logAudit } from "../../services/audit";
import type { AppEnv } from "../../types";
import {
  paginationQuerySchema,
  markOrderTransmittedSchema,
  type OrderStatus,
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

// GET / — list orders with filters
ordersRouter.get("/", async (c) => {
  const kavaId = c.get("kavaId")!;
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
      itemCount: sql<number>`count(${orderItems.id})::int`,
      total: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}::numeric), 0)::numeric`,
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
      customerAddress: customers.address,
      customerVatId: customers.vatId,
      customerTaxOffice: customers.taxOffice,
      customerProfession: customers.profession,
      customerBillingAddress: customers.billingAddress,
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
      sku: products.sku,
      erpRef: products.erpRef,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
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

// PATCH /:id/erp — mark an order as transmitted to the ERP, store the AADE MARK
ordersRouter.patch("/:id/erp", async (c) => {
  const kavaId = c.get("kavaId")!;
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
    .where(and(eq(orders.id, id), eq(orders.kavaId, kavaId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Η παραγγελία δεν βρέθηκε" }, 404);
  }

  if (existing.erpStatus === "transmitted") {
    return c.json({ error: "Η παραγγελία έχει ήδη διαβιβαστεί" }, 409);
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

export { ordersRouter };
