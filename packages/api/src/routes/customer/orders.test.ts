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

    const customerAId = await provisionCustomerUser(custAEmail, "Customer A");
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
        customerId: customerAId,
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
});
