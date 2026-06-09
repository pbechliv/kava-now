import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { Context } from "hono";
import type { AppEnv } from "../../types";

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
  sendOrderNotification: vi.fn().mockResolvedValue(undefined),
  sendOrderStatusChange: vi.fn().mockResolvedValue(undefined),
}));

const fakeContext = {
  req: { raw: { headers: new Headers() } },
} as unknown as Context<AppEnv>;

suite("DELETE /admin/users/:id (global-account cleanup boundary)", () => {
  let app: typeof import("../../app").app;
  let db: typeof import("../../db/connection").db;
  let baseDb: typeof import("../../db/connection").baseDb;
  let queryClient: typeof import("../../db/connection").queryClient;
  let schema: typeof import("../../db/schema/index");
  let inviteUserToTenant: typeof import("../../services/invite-user").inviteUserToTenant;

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slug = `usr-${suffix}`;
  const ownerEmail = `usr-owner-${suffix}@example.com`;
  const ownerPassword = "usertest-pass-123";

  let tenantId = "";
  let otherTenantId = "";
  let ownerUserId = "";
  let cookie = "";
  const userEmails: string[] = [ownerEmail];

  const removeUser = (id: string) =>
    app.request(`/api/k/${slug}/admin/users/${id}`, {
      method: "DELETE",
      headers: { cookie, "content-type": "application/json" },
    });

  async function invitedStaff(emailAddr: string) {
    userEmails.push(emailAddr);
    await inviteUserToTenant({
      c: fakeContext,
      tenantId,
      email: emailAddr,
      name: "Invitee",
      role: "staff",
      inviterId: ownerUserId,
    });
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, emailAddr));
    return user!.id;
  }

  async function userRowExists(id: string) {
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return rows.length > 0;
  }

  beforeAll(async () => {
    const conn = await import("../../db/connection");
    ({ db, baseDb, queryClient } = conn);
    schema = await import("../../db/schema/index");
    ({ app } = await import("../../app"));
    ({ inviteUserToTenant } = await import("../../services/invite-user"));
    const { createTenantWithOwner } = await import("../../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "User Test Tenant",
      slug,
      email: ownerEmail,
      password: ownerPassword,
    });
    tenantId = created.tenantId;
    ownerUserId = created.ownerUserId;

    const [other] = await baseDb
      .insert(schema.tenants)
      .values({ name: "User Test Other", slug: `usr-o-${suffix}`, email: "o@example.com" })
      .returning({ id: schema.tenants.id });
    otherTenantId = other!.id;

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

  it("resend-invite invalidates stale reset tokens and issues a fresh one (#57)", async () => {
    const id = await invitedStaff(`usr-resend-${suffix}@example.com`);

    // Plant a stale token in better-auth's storage shape (identifier carries
    // the token, value carries the user id).
    await baseDb.insert(schema.verifications).values({
      identifier: "reset-password:stale-token-xyz",
      value: id,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const res = await app.request(`/api/k/${slug}/admin/users/${id}/resend-invite`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    expect(res.status).toBe(200);

    // Only the freshly issued token survives — the stale one (and the
    // original invite's token) are invalidated.
    const tokens = await baseDb
      .select({ identifier: schema.verifications.identifier })
      .from(schema.verifications)
      .where(eq(schema.verifications.value, id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.identifier).not.toBe("reset-password:stale-token-xyz");
    expect(tokens[0]!.identifier.startsWith("reset-password:")).toBe(true);

    await baseDb.delete(schema.verifications).where(eq(schema.verifications.value, id));
  });

  it("never-activated invitee → membership and orphaned global user are removed", async () => {
    const id = await invitedStaff(`usr-orphan-${suffix}@example.com`);

    const res = await removeUser(id);
    expect(res.status).toBe(200);
    expect(await userRowExists(id)).toBe(false);
  });

  it("activated user (credential account) → membership removed, global account survives", async () => {
    const id = await invitedStaff(`usr-active-${suffix}@example.com`);
    await db.insert(schema.accounts).values({
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword("some-real-password-123"),
    });

    const res = await removeUser(id);
    expect(res.status).toBe(200);

    const memberships = await db
      .select({ id: schema.tenantMemberships.userId })
      .from(schema.tenantMemberships)
      .where(eq(schema.tenantMemberships.userId, id));
    expect(memberships).toHaveLength(0);
    expect(await userRowExists(id)).toBe(true);
  });

  it("superadmin target → global account survives even when passwordless and orphaned", async () => {
    const id = await invitedStaff(`usr-super-${suffix}@example.com`);
    await baseDb.update(schema.users).set({ isSuperAdmin: true }).where(eq(schema.users.id, id));

    const res = await removeUser(id);
    expect(res.status).toBe(200);
    expect(await userRowExists(id)).toBe(true);
  });

  it("invitee with a membership in another tenant → global account survives", async () => {
    const id = await invitedStaff(`usr-multi-${suffix}@example.com`);
    await baseDb
      .insert(schema.tenantMemberships)
      .values({ userId: id, tenantId: otherTenantId, role: "staff" });

    const res = await removeUser(id);
    expect(res.status).toBe(200);
    expect(await userRowExists(id)).toBe(true);

    const memberships = await db
      .select({ tenantId: schema.tenantMemberships.tenantId })
      .from(schema.tenantMemberships)
      .where(eq(schema.tenantMemberships.userId, id));
    expect(memberships).toEqual([{ tenantId: otherTenantId }]);
  });
});
