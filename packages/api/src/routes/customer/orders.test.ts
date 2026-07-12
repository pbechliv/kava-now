import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { Context } from "hono";
import type { OrderStatus } from "@kava-now/shared";
import type { AppEnv } from "../../types";
import { must } from "../../test-utils";

// Integration tests against a live Postgres reachable as the NOSUPERUSER app
// role (same gate as the RLS suite). Set RLS_TEST_DATABASE_URL to run them.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

vi.mock("../../services/email", () => ({
  sendPasswordSet: vi.fn().mockResolvedValue(undefined),
  sendMembershipAdded: vi.fn().mockResolvedValue(undefined),
}));

const fakeContext = {
  req: { raw: { headers: new Headers() } },
} as unknown as Context<AppEnv>;

suite("customer orders (server-side pricing + customer scoping)", () => {
  let app: typeof import("../../app").app;
  let db: typeof import("../../db/connection").db;
  let baseDb: typeof import("../../db/connection").baseDb;
  let runWithTenant: typeof import("../../db/connection").runWithTenant;
  let queryClient: typeof import("../../db/connection").queryClient;
  let schema: typeof import("../../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slug = `cord-${suffix}`;
  const ownerEmail = `cord-owner-${suffix}@example.com`;
  const custAEmail = `cord-a-${suffix}@example.com`;
  const custBEmail = `cord-b-${suffix}@example.com`;
  const password = "custorder-pass-123";

  let tenantId = "";
  let productId = "";
  let custAId = "";
  const cookies: Record<string, string> = {};

  const api = (cookie: string, path: string, init?: Omit<RequestInit, "headers">) =>
    app.request(`/api/k/${slug}/customer${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json" },
    });

  async function provisionCustomerUser(email: string, name: string): Promise<string> {
    const customer = await runWithTenant(tenantId, async () => {
      const [row] = await db
        .insert(schema.customers)
        .values({ tenantId, name })
        .returning({ id: schema.customers.id });
      return must(row);
    });
    const { inviteUserToTenant } = await import("../../services/invite-user");
    await inviteUserToTenant({
      c: fakeContext,
      tenantId,
      email,
      name,
      role: "customer",
      customerId: customer.id,
    });
    const [user] = await baseDb
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    await baseDb.insert(schema.accounts).values({
      accountId: must(user).id,
      providerId: "credential",
      userId: must(user).id,
      password: await hashPassword(password),
    });
    return customer.id;
  }

  async function signIn(email: string) {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  beforeAll(async () => {
    const conn = await import("../../db/connection");
    ({ db, baseDb, runWithTenant, queryClient } = conn);
    schema = await import("../../db/schema/index");
    ({ app } = await import("../../app"));
    const { createTenantWithOwner } = await import("../../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "Customer Orders Tenant",
      slug,
      email: ownerEmail,
      password,
    });
    tenantId = created.tenantId;

    custAId = await provisionCustomerUser(custAEmail, "Customer A");
    await provisionCustomerUser(custBEmail, "Customer B");

    // Product priced to hit the float-rounding regression (2.01 at 50% must
    // become 1.01), plus the brand discount for customer A only.
    await runWithTenant(tenantId, async () => {
      const [p] = await db
        .insert(schema.products)
        .values({ tenantId, name: "Discounted Gin", brand: "TBrand", basePrice: "2.01" })
        .returning({ id: schema.products.id });
      productId = must(p).id;
      await db.insert(schema.customerBrandPricing).values({
        tenantId,
        customerId: custAId,
        brand: "TBrand",
        discountPct: "50.00",
      });
    });

    cookies.a = await signIn(custAEmail);
    cookies.b = await signIn(custBEmail);
  });

  afterAll(async () => {
    if (baseDb && tenantId) {
      await baseDb.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      await baseDb
        .delete(schema.users)
        .where(inArray(schema.users.email, [ownerEmail, custAEmail, custBEmail]));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("snapshots the server-resolved, brand-discounted unit price at order time", async () => {
    const res = await api(must(cookies.a), "/orders", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId, quantity: 2 }] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // 2.01 at 50% → 1.01 (integer-cent rounding, #54); price comes from the
    // server — the client never supplies one.
    expect(body.items).toHaveLength(1);
    expect(Number(body.items[0].unitPrice)).toBe(1.01);
    expect(body.items[0].originalQuantity).toBe(2);
  });

  it("a customer without the brand discount pays the base price", async () => {
    const res = await api(must(cookies.b), "/orders", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId, quantity: 1 }] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Number(body.items[0].unitPrice)).toBe(2.01);
  });

  it("assigns gap-free per-tenant sequential order numbers, surfaced in list + detail (#161)", async () => {
    const place = async () => {
      const res = await api(must(cookies.a), "/orders", {
        method: "POST",
        body: JSON.stringify({ items: [{ productId, quantity: 1 }] }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { order: { id: string; orderNumber: number } };
    };

    const first = await place();
    const second = await place();

    // Create response carries the number; strictly consecutive, no gap.
    expect(Number.isInteger(first.order.orderNumber)).toBe(true);
    expect(second.order.orderNumber).toBe(first.order.orderNumber + 1);

    // Detail endpoint surfaces it.
    const detail = await (await api(must(cookies.a), `/orders/${second.order.id}`)).json();
    expect(detail.orderNumber).toBe(second.order.orderNumber);

    // List endpoint surfaces it — newest first.
    const list = await (await api(must(cookies.a), "/orders")).json();
    const numbers = (list.data as { id: string; orderNumber: number }[]).map((o) => o.orderNumber);
    expect(numbers).toContain(first.order.orderNumber);
    expect(numbers).toContain(second.order.orderNumber);
  });

  it("filters order history by status and date range (#178)", async () => {
    // A delivered order dated in the distant past — isolates it from the other
    // orders this customer placed above (all pending, dated today).
    const pastOrderId = await runWithTenant(tenantId, async () => {
      const [order] = await db
        .insert(schema.orders)
        .values({
          tenantId,
          customerId: custAId,
          orderNumber: 90001,
          status: "delivered",
          createdAt: new Date("2020-06-15T12:00:00Z"),
        })
        .returning({ id: schema.orders.id });
      const oid = must(order).id;
      await db
        .insert(schema.orderItems)
        .values({ orderId: oid, productId, quantity: 1, unitPrice: "1.01", productName: "Gin" });
      return oid;
    });

    const ids = async (query: string) => {
      const list = await (await api(must(cookies.a), `/orders${query}`)).json();
      return new Set((list.data as { id: string }[]).map((r) => r.id));
    };

    // Status: the delivered order matches; a status it isn't excludes it.
    expect((await ids("?status=delivered")).has(pastOrderId)).toBe(true);
    expect((await ids("?status=pending")).has(pastOrderId)).toBe(false);

    // Date range: 2020 window includes it; a 2019 window excludes it.
    expect((await ids("?dateFrom=2020-01-01&dateTo=2020-12-31")).has(pastOrderId)).toBe(true);
    expect((await ids("?dateFrom=2019-01-01&dateTo=2019-12-31")).has(pastOrderId)).toBe(false);

    // Garbage date is rejected at the boundary, not surfaced as a 500 (#55).
    expect((await api(must(cookies.a), "/orders?dateFrom=garbage")).status).toBe(400);
  });

  it("catalog/resolve returns the customer's current price and availability", async () => {
    const res = await api(must(cookies.a), "/catalog/resolve", {
      method: "POST",
      body: JSON.stringify({ productIds: [productId] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: productId, available: true });
    expect(body[0].resolvedPrice).toBe(1.01); // customer A: 2.01 @ 50%
  });

  it("catalog/resolve flags a deactivated product as unavailable", async () => {
    const goneId = await runWithTenant(tenantId, async () => {
      const [p] = await db
        .insert(schema.products)
        .values({
          tenantId,
          name: `Resolve Gone ${suffix}`,
          brand: "TBrand",
          basePrice: "9.00",
          active: false,
        })
        .returning({ id: schema.products.id });
      return must(p).id;
    });
    const res = await api(must(cookies.a), "/catalog/resolve", {
      method: "POST",
      body: JSON.stringify({ productIds: [goneId] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toEqual({ id: goneId, available: false, resolvedPrice: null });
  });

  it("placing an order with an unavailable product reports the offending ids", async () => {
    const goneId = await runWithTenant(tenantId, async () => {
      const [p] = await db
        .insert(schema.products)
        .values({
          tenantId,
          name: `Order Gone ${suffix}`,
          brand: "TBrand",
          basePrice: "9.00",
          active: false,
        })
        .returning({ id: schema.products.id });
      return must(p).id;
    });
    const res = await api(must(cookies.a), "/orders", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: goneId, quantity: 1 }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PRODUCT_NOT_AVAILABLE");
    expect(body.unavailableProductIds).toEqual([goneId]);
  });

  it("customers cannot read each other's orders (membership.customerId scoping)", async () => {
    const created = await api(must(cookies.a), "/orders", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId, quantity: 1 }] }),
    });
    const orderId = (await created.json()).order.id as string;

    const own = await api(must(cookies.a), `/orders/${orderId}`);
    expect(own.status).toBe(200);

    const foreign = await api(must(cookies.b), `/orders/${orderId}`);
    expect(foreign.status).toBe(404);
  });

  it("never exposes staff internal notes through customer-facing endpoints", async () => {
    const created = await api(must(cookies.a), "/orders", {
      method: "POST",
      body: JSON.stringify({
        items: [{ productId, quantity: 1 }],
        notes: "leave at the back door",
      }),
    });
    const orderId = (await created.json()).order.id as string;

    // Staff attach an internal note directly (no customer route can set it).
    await runWithTenant(tenantId, () =>
      db
        .update(schema.orders)
        .set({ internalNotes: "watch the credit limit" })
        .where(eq(schema.orders.id, orderId)),
    );

    const detail = await (await api(must(cookies.a), `/orders/${orderId}`)).json();
    expect(detail.notes).toBe("leave at the back door"); // own comment is visible
    expect(detail.internalNotes).toBeUndefined(); // internal note is not

    const listed = (await (await api(must(cookies.a), "/orders")).json()).data.find(
      (r: { id: string }) => r.id === orderId,
    );
    expect(listed.internalNotes).toBeUndefined();
  });

  // ---- Customer-initiated cancellation ----

  async function createOrderA(): Promise<string> {
    const res = await api(must(cookies.a), "/orders", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId, quantity: 1 }] }),
    });
    expect(res.status).toBe(201);
    return (await res.json()).order.id as string;
  }

  const setStatus = (orderId: string, status: OrderStatus) =>
    runWithTenant(tenantId, () =>
      db.update(schema.orders).set({ status }).where(eq(schema.orders.id, orderId)),
    );

  it("cancels a pending order immediately as cancelled_by_customer", async () => {
    const orderId = await createOrderA();
    const res = await api(must(cookies.a), `/orders/${orderId}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancelled_by_customer");
  });

  it("turns cancellation of a confirmed order into a request, not an outright cancel", async () => {
    const orderId = await createOrderA();
    await setStatus(orderId, "confirmed");
    const res = await api(must(cookies.a), `/orders/${orderId}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancellation_requested");
  });

  it("refuses to cancel once the order has shipped", async () => {
    const orderId = await createOrderA();
    await setStatus(orderId, "shipped");
    const res = await api(must(cookies.a), `/orders/${orderId}/cancel`, { method: "POST" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ORDER_LOCKED_BY_STATUS");
  });

  it("refuses to cancel an ERP-transmitted order", async () => {
    const orderId = await createOrderA();
    await runWithTenant(tenantId, () =>
      db
        .update(schema.orders)
        .set({ erpStatus: "transmitted" })
        .where(eq(schema.orders.id, orderId)),
    );
    const res = await api(must(cookies.a), `/orders/${orderId}/cancel`, { method: "POST" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ORDER_LOCKED_BY_ERP");
  });

  it("cannot cancel another customer's order — 404, and the order is untouched", async () => {
    const orderId = await createOrderA();
    const foreign = await api(must(cookies.b), `/orders/${orderId}/cancel`, { method: "POST" });
    expect(foreign.status).toBe(404);
    const detail = await (await api(must(cookies.a), `/orders/${orderId}`)).json();
    expect(detail.status).toBe("pending");
  });

  it("withdraws a pending cancellation request back to confirmed (#176)", async () => {
    const orderId = await createOrderA();
    await setStatus(orderId, "cancellation_requested");
    const res = await api(must(cookies.a), `/orders/${orderId}/withdraw-cancellation`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("confirmed");
  });

  it("refuses to withdraw when no cancellation request is pending", async () => {
    const orderId = await createOrderA();
    const res = await api(must(cookies.a), `/orders/${orderId}/withdraw-cancellation`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ORDER_CANCELLATION_NOT_REQUESTED");
  });

  it("cannot withdraw another customer's cancellation request — 404, untouched", async () => {
    const orderId = await createOrderA();
    await setStatus(orderId, "cancellation_requested");
    const foreign = await api(must(cookies.b), `/orders/${orderId}/withdraw-cancellation`, {
      method: "POST",
    });
    expect(foreign.status).toBe(404);
    const detail = await (await api(must(cookies.a), `/orders/${orderId}`)).json();
    expect(detail.status).toBe("cancellation_requested");
  });
});
