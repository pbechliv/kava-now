import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Integration tests against a live Postgres (same gate as the RLS suite).
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

suite("PATCH /api/auth/me (email change requires re-auth)", () => {
  let app: typeof import("../app").app;
  let baseDb: typeof import("../db/connection").baseDb;
  let queryClient: typeof import("../db/connection").queryClient;
  let schema: typeof import("../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const ownerEmail = `me-owner-${suffix}@example.com`;
  const newEmail = `me-new-${suffix}@example.com`;
  const password = "metest-pass-123";

  let tenantId = "";
  let userId = "";
  let cookie = "";

  const patchMe = (body: unknown) =>
    app.request("/api/auth/me", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const conn = await import("../db/connection");
    ({ baseDb, queryClient } = conn);
    schema = await import("../db/schema/index");
    ({ app } = await import("../app"));
    const { createTenantWithOwner } = await import("../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "Me Test Tenant",
      slug: `me-${suffix}`,
      email: ownerEmail,
      password,
    });
    tenantId = created.tenantId;
    userId = created.ownerUserId;

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password }),
    });
    expect(signIn.status).toBe(200);
    cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });

  afterAll(async () => {
    if (baseDb && tenantId) {
      await baseDb.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      await baseDb.delete(schema.users).where(inArray(schema.users.email, [ownerEmail, newEmail]));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("public signup is disabled — the invite-only invariant holds (#68)", async () => {
    const addr = `me-signup-${suffix}@example.com`;
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: addr, password: "sneaky-password-123", name: "Sneaky" }),
    });
    // The databaseHooks.user.create.before guard must reject the attempt —
    // a better-auth upgrade silently changing hook semantics would re-open
    // public signup on a production SaaS.
    expect(res.status).toBeGreaterThanOrEqual(400);

    const rows = await baseDb
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, addr));
    expect(rows).toHaveLength(0);
  });

  it("name-only change needs no password", async () => {
    const res = await patchMe({ name: "Renamed Owner" });
    expect(res.status).toBe(200);
  });

  it("email change without the current password → 403", async () => {
    const res = await patchMe({ email: newEmail });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_CURRENT_PASSWORD");
  });

  it("email change with a wrong password → 403", async () => {
    const res = await patchMe({ email: newEmail, currentPassword: "wrong-password-1" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_CURRENT_PASSWORD");
  });

  it("email change with the correct password → applied, emailVerified reset", async () => {
    const res = await patchMe({ email: newEmail, currentPassword: password });
    expect(res.status).toBe(200);

    const [row] = await baseDb
      .select({ email: schema.users.email, emailVerified: schema.users.emailVerified })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(row?.email).toBe(newEmail);
    expect(row?.emailVerified).toBe(false);
  });
});
