import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { must } from "../test-utils";

// Integration tests against a live Postgres reachable as the NOSUPERUSER app
// role (same gate as the RLS suite). Set RLS_TEST_DATABASE_URL to run them.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

vi.mock("../services/email", () => ({
  sendPasswordSet: vi.fn().mockResolvedValue(undefined),
  sendMembershipAdded: vi.fn().mockResolvedValue(undefined),
}));

const fakeContext = {
  req: { raw: { headers: new Headers() } },
} as unknown as Context<AppEnv>;

suite("requireRole (app-layer tenant privilege boundary)", () => {
  let app: typeof import("../app").app;
  let db: typeof import("../db/connection").db;
  let baseDb: typeof import("../db/connection").baseDb;
  let runWithTenant: typeof import("../db/connection").runWithTenant;
  let queryClient: typeof import("../db/connection").queryClient;
  let schema: typeof import("../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slugA = `role-a-${suffix}`;
  const slugB = `role-b-${suffix}`;
  const password = "roletest-pass-123";
  const ownerAEmail = `role-owner-a-${suffix}@example.com`;
  const ownerBEmail = `role-owner-b-${suffix}@example.com`;
  const customerEmail = `role-cust-${suffix}@example.com`;
  const superEmail = `role-super-${suffix}@example.com`;

  let tenantAId = "";
  let tenantBId = "";
  const cookies: Record<string, string> = {};

  const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });

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
    const conn = await import("../db/connection");
    ({ db, baseDb, runWithTenant, queryClient } = conn);
    schema = await import("../db/schema/index");
    ({ app } = await import("../app"));
    const { createTenantWithOwner } = await import("../services/create-tenant");
    const { inviteUserToTenant } = await import("../services/invite-user");

    const a = await createTenantWithOwner({
      name: "Role A",
      slug: slugA,
      email: ownerAEmail,
      password,
    });
    const b = await createTenantWithOwner({
      name: "Role B",
      slug: slugB,
      email: ownerBEmail,
      password,
    });
    tenantAId = a.tenantId;
    tenantBId = b.tenantId;

    // Customer of tenant A, with a password so they can sign in.
    const customer = await runWithTenant(tenantAId, async () => {
      const [row] = await db
        .insert(schema.customers)
        .values({ tenantId: tenantAId, name: "Role Customer" })
        .returning({ id: schema.customers.id });
      return must(row);
    });
    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantAId,
      email: customerEmail,
      name: "Role Customer User",
      role: "customer",
      customerId: customer.id,
    });
    const [custUser] = await baseDb
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, customerEmail));
    await baseDb.insert(schema.accounts).values({
      accountId: must(custUser).id,
      providerId: "credential",
      userId: must(custUser).id,
      password: await hashPassword(password),
    });

    // Superadmin with NO membership in either tenant.
    const [superUser] = await baseDb
      .insert(schema.users)
      .values({ email: superEmail, name: "Role Super", isSuperAdmin: true, emailVerified: true })
      .returning({ id: schema.users.id });
    await baseDb.insert(schema.accounts).values({
      accountId: must(superUser).id,
      providerId: "credential",
      userId: must(superUser).id,
      password: await hashPassword(password),
    });

    cookies.ownerA = await signIn(ownerAEmail);
    cookies.customer = await signIn(customerEmail);
    cookies.superadmin = await signIn(superEmail);
  });

  afterAll(async () => {
    if (baseDb && tenantAId) {
      await baseDb
        .delete(schema.tenants)
        .where(inArray(schema.tenants.id, [tenantAId, tenantBId].filter(Boolean)));
      await baseDb
        .delete(schema.users)
        .where(inArray(schema.users.email, [ownerAEmail, ownerBEmail, customerEmail, superEmail]));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("owner reaches their own tenant's admin routes", async () => {
    const res = await get(must(cookies.ownerA), `/api/k/${slugA}/admin/products`);
    expect(res.status).toBe(200);
  });

  it("customer hitting admin routes → 403", async () => {
    const res = await get(must(cookies.customer), `/api/k/${slugA}/admin/products`);
    expect(res.status).toBe(403);
  });

  it("owner of tenant A hitting tenant B's admin routes → 403", async () => {
    const res = await get(must(cookies.ownerA), `/api/k/${slugB}/admin/products`);
    expect(res.status).toBe(403);
  });

  it("owner hitting customer routes → 403 (no customer membership)", async () => {
    const res = await get(must(cookies.ownerA), `/api/k/${slugA}/customer/catalog`);
    expect(res.status).toBe(403);
  });

  it("customer reaches customer routes", async () => {
    const res = await get(must(cookies.customer), `/api/k/${slugA}/customer/catalog`);
    expect(res.status).toBe(200);
  });

  it("anonymous request → 401", async () => {
    const res = await app.request(`/api/k/${slugA}/admin/products`);
    expect(res.status).toBe(401);
  });

  it("superadmin bypasses membership lookup with a synthetic owner membership", async () => {
    const resA = await get(must(cookies.superadmin), `/api/k/${slugA}/admin/products`);
    expect(resA.status).toBe(200);
    const resB = await get(must(cookies.superadmin), `/api/k/${slugB}/admin/products`);
    expect(resB.status).toBe(200);
  });
});
