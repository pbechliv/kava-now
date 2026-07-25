import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { must } from "../../test-utils";

// Integration tests against a live Postgres reachable as the NOSUPERUSER app
// role (same gate as the RLS suite). Set RLS_TEST_DATABASE_URL to run them.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

// Must be set before any app module is (dynamically) imported.
if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

// No SMTP in CI — emails are mocked.
vi.mock("../../services/email", () => ({
  sendPasswordSet: vi.fn().mockResolvedValue(undefined),
  sendMembershipAdded: vi.fn().mockResolvedValue(undefined),
}));

const fakeContext = {
  req: { raw: { headers: new Headers() } },
} as unknown as Context<AppEnv>;

suite("GET /admin/customer-users (tenant-wide customer users list)", () => {
  let app: typeof import("../../app").app;
  let db: typeof import("../../db/connection").db;
  let baseDb: typeof import("../../db/connection").baseDb;
  let runWithTenant: typeof import("../../db/connection").runWithTenant;
  let queryClient: typeof import("../../db/connection").queryClient;
  let schema: typeof import("../../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slug = `cusr-${suffix}`;
  const otherSlug = `cusr-o-${suffix}`;
  const ownerEmail = `cusr-owner-${suffix}@example.com`;
  const ownerPassword = "cusrtest-pass-123";

  // Deliberately inserted out of alphabetical order — the list must sort by
  // customer name, not insertion order.
  const zetaEmail = `cusr-zeta-${suffix}@example.com`;
  const alphaEmail = `cusr-alpha-${suffix}@example.com`;
  const otherTenantEmail = `cusr-other-${suffix}@example.com`;

  let tenantId = "";
  let otherTenantId = "";
  let ownerUserId = "";
  let zetaCustomerId = "";
  let alphaCustomerId = "";
  let otherCustomerId = "";
  let cookie = "";
  const userEmails: string[] = [ownerEmail, zetaEmail, alphaEmail, otherTenantEmail];

  const list = (query = "") =>
    app.request(`/api/k/${slug}/admin/customer-users${query}`, {
      headers: { cookie, "content-type": "application/json" },
    });

  beforeAll(async () => {
    const conn = await import("../../db/connection");
    ({ db, baseDb, runWithTenant, queryClient } = conn);
    schema = await import("../../db/schema/index");
    ({ app } = await import("../../app"));
    const { inviteUserToTenant } = await import("../../services/invite-user");
    const { createTenantWithOwner } = await import("../../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "Customer Users Tenant",
      slug,
      email: ownerEmail,
      password: ownerPassword,
    });
    tenantId = created.tenantId;
    ownerUserId = created.ownerUserId;

    const [other] = await baseDb
      .insert(schema.tenants)
      .values({ name: "Customer Users Other", slug: otherSlug, email: "o@example.com" })
      .returning({ id: schema.tenants.id });
    otherTenantId = must(other).id;

    // Customers are inserted inside their tenant context so RLS WITH CHECK
    // passes.
    const insertCustomer = (tid: string, name: string) =>
      runWithTenant(tid, async () => {
        const [row] = await db
          .insert(schema.customers)
          .values({ tenantId: tid, name })
          .returning({ id: schema.customers.id });
        return must(row).id;
      });
    zetaCustomerId = await insertCustomer(tenantId, "Ζήτα Καφετέρια");
    alphaCustomerId = await insertCustomer(tenantId, "Άλφα Μπαρ");
    otherCustomerId = await insertCustomer(otherTenantId, "Ξένος Πελάτης");

    await inviteUserToTenant({
      c: fakeContext,
      tenantId,
      email: zetaEmail,
      name: "Ζήτα Χρήστης",
      role: "customer",
      customerId: zetaCustomerId,
      inviterId: ownerUserId,
    });
    await inviteUserToTenant({
      c: fakeContext,
      tenantId,
      email: alphaEmail,
      name: "Άλφα Χρήστης",
      role: "customer",
      customerId: alphaCustomerId,
      inviterId: ownerUserId,
    });
    await inviteUserToTenant({
      c: fakeContext,
      tenantId: otherTenantId,
      email: otherTenantEmail,
      name: "Ξένος Χρήστης",
      role: "customer",
      customerId: otherCustomerId,
      inviterId: null,
    });

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    expect(signIn.status).toBe(200);
    cookie = signIn.headers.get("set-cookie") ?? "";
  });

  afterAll(async () => {
    if (baseDb && tenantId) {
      await baseDb
        .delete(schema.tenants)
        .where(inArray(schema.tenants.id, [tenantId, otherTenantId].filter(Boolean)));
      await baseDb.delete(schema.users).where(inArray(schema.users.email, userEmails));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("lists this tenant's customer users tagged with their customer", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(2);
    // Sorted by customer name — "Άλφα Μπαρ" before "Ζήτα Καφετέρια".
    expect(body.data.map((u: { email: string }) => u.email)).toEqual([alphaEmail, zetaEmail]);
    expect(body.data[0]).toMatchObject({
      email: alphaEmail,
      customerName: "Άλφα Μπαρ",
      invitedByName: "Customer Users Tenant",
      emailVerified: false,
    });
    expect(body.data[0].customerId).toBeTruthy();
    // Staff/owner memberships and other tenants' customer users stay out.
    expect(body.data.map((u: { email: string }) => u.email)).not.toContain(ownerEmail);
    expect(body.data.map((u: { email: string }) => u.email)).not.toContain(otherTenantEmail);
  });

  it("search matches the user's email and the customer's name", async () => {
    const byEmail = await list(`?search=${encodeURIComponent(zetaEmail)}`);
    const byEmailBody = await byEmail.json();
    expect(byEmailBody.total).toBe(1);
    expect(byEmailBody.data[0].email).toBe(zetaEmail);

    // Accent-insensitive customer-name match (stored "Άλφα Μπαρ").
    const byCustomer = await list("?search=αλφα");
    const byCustomerBody = await byCustomer.json();
    expect(byCustomerBody.total).toBe(1);
    expect(byCustomerBody.data[0].customerName).toBe("Άλφα Μπαρ");

    const noMatch = await list("?search=zzz-no-such-thing");
    expect((await noMatch.json()).total).toBe(0);
  });

  it("?customerId= narrows to one customer's users (the per-customer list)", async () => {
    const res = await list(`?customerId=${alphaCustomerId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({ email: alphaEmail, customerName: "Άλφα Μπαρ" });

    // Combines with search.
    const filtered = await list(`?customerId=${alphaCustomerId}&search=zzz`);
    expect((await filtered.json()).total).toBe(0);

    // A customer in another tenant is a 404, not this tenant's list.
    const foreign = await list(`?customerId=${otherCustomerId}`);
    expect(foreign.status).toBe(404);

    // So is an id that matches no customer at all.
    const missing = await list("?customerId=00000000-0000-0000-0000-000000000000");
    expect(missing.status).toBe(404);

    // A malformed id is rejected at the boundary.
    const malformed = await list("?customerId=not-a-uuid");
    expect(malformed.status).toBe(400);
  });

  it("paginates, with the total counting every match", async () => {
    const res = await list("?page=2&pageSize=1");
    const body = await res.json();
    expect(body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe(zetaEmail);
  });
});
