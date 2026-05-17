import { Hono } from "hono";
import { eq, and, sql, gte } from "drizzle-orm";
import { db } from "../../db/connection";
import { orders, orderItems, customers } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const dashboardRouter = new Hono<AppEnv>();

// GET /stats
dashboardRouter.get("/stats", async (c) => {
  const tenantId = c.get("tenantId")!;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Run efficient COUNT queries in parallel
  const [[ordersToday], [pendingOrders], [ordersThisWeek], [totalCustomers], recentOrders] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, todayStart))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "pending"))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, weekAgo))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(eq(customers.tenantId, tenantId)),
      db
        .select({
          id: orders.id,
          status: orders.status,
          createdAt: orders.createdAt,
          customerName: customers.name,
          itemCount: sql<number>`count(${orderItems.id})::int`,
          total: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}::numeric), 0)::numeric`,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
        .where(eq(orders.tenantId, tenantId))
        .groupBy(orders.id, customers.name)
        .orderBy(sql`${orders.createdAt} desc`)
        .limit(5),
    ]);

  return c.json({
    ordersToday: ordersToday?.count ?? 0,
    pendingOrders: pendingOrders?.count ?? 0,
    ordersThisWeek: ordersThisWeek?.count ?? 0,
    totalCustomers: totalCustomers?.count ?? 0,
    recentOrders,
  });
});

export { dashboardRouter };
