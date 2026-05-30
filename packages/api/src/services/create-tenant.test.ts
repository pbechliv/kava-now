import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

// Integration tests against a live Postgres (same gate as the RLS suite). The
// tables touched here (tenants/users/accounts/tenant_memberships) have no RLS,
// so the app role can write them freely.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

suite("createTenantWithOwner (C2: atomic, no orphan tenant)", () => {
  let createTenantWithOwner: typeof import("./create-tenant").createTenantWithOwner;
  let db: typeof import("../db/connection").db;
  let queryClient: typeof import("../db/connection").queryClient;
  let schema: typeof import("../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const tenantIds: string[] = [];
  const userEmails: string[] = [];

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = APP_URL;
    ({ createTenantWithOwner } = await import("./create-tenant"));
    const conn = await import("../db/connection");
    db = conn.db;
    queryClient = conn.queryClient;
    schema = await import("../db/schema/index");
  });

  afterAll(async () => {
    if (db && tenantIds.length) {
      await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    }
    if (db && userEmails.length) {
      await db.delete(schema.users).where(inArray(schema.users.email, userEmails));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("creates tenant + owner user + credential account + owner membership with a password", async () => {
    const email = `owner-${suffix}@example.com`;
    userEmails.push(email);
    const res = await createTenantWithOwner({
      name: "Pw Tenant",
      slug: `c2-pw-${suffix}`,
      email,
      password: "supersecret123",
    });
    tenantIds.push(res.tenantId);

    expect(res.isNewUser).toBe(true);

    const [acct] = await db
      .select({ password: schema.accounts.password, providerId: schema.accounts.providerId })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, res.ownerUserId));
    expect(acct?.providerId).toBe("credential");
    expect(acct?.password).toBeTruthy();

    const [mem] = await db
      .select({ role: schema.tenantMemberships.role })
      .from(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.userId, res.ownerUserId),
          eq(schema.tenantMemberships.tenantId, res.tenantId),
        ),
      );
    expect(mem?.role).toBe("owner");
  });

  it("creates a passwordless owner (invite path) with no credential account", async () => {
    const email = `invite-${suffix}@example.com`;
    userEmails.push(email);
    const res = await createTenantWithOwner({
      name: "Invite Tenant",
      slug: `c2-inv-${suffix}`,
      email,
    });
    tenantIds.push(res.tenantId);

    expect(res.isNewUser).toBe(true);
    const accts = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, res.ownerUserId));
    expect(accts).toHaveLength(0);
  });

  it("reuses an existing user as owner across tenants", async () => {
    const email = `existing-${suffix}@example.com`;
    userEmails.push(email);
    const first = await createTenantWithOwner({ name: "T1", slug: `c2-e1-${suffix}`, email });
    tenantIds.push(first.tenantId);
    const second = await createTenantWithOwner({ name: "T2", slug: `c2-e2-${suffix}`, email });
    tenantIds.push(second.tenantId);

    expect(second.isNewUser).toBe(false);
    expect(second.ownerUserId).toBe(first.ownerUserId);
  });

  it("rolls back atomically on a duplicate slug (no second tenant, no orphan user)", async () => {
    const slug = `c2-dup-${suffix}`;
    const first = await createTenantWithOwner({
      name: "Dup",
      slug,
      email: `dup-${suffix}@example.com`,
    });
    tenantIds.push(first.tenantId);
    userEmails.push(`dup-${suffix}@example.com`, `dup2-${suffix}@example.com`);

    await expect(
      createTenantWithOwner({ name: "Dup2", slug, email: `dup2-${suffix}@example.com` }),
    ).rejects.toThrow();

    const tenantsWithSlug = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug));
    expect(tenantsWithSlug).toHaveLength(1);

    const orphan = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, `dup2-${suffix}@example.com`));
    expect(orphan).toHaveLength(0);
  });
});
