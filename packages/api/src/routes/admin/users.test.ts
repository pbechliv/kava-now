import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
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
    return must(user).id;
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
    otherTenantId = must(other).id;

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

  it("owner-protection rules: self-delete, staff limits, last owner (#68)", async () => {
    // CANT_DELETE_SELF — the owner cannot remove their own membership.
    const self = await removeUser(ownerUserId);
    expect(self.status).toBe(400);
    expect((await self.json()).code).toBe("CANT_DELETE_SELF");

    // Activated staff session.
    const staffEmail = `usr-staffsess-${suffix}@example.com`;
    const staffId = await invitedStaff(staffEmail);
    await baseDb.insert(schema.accounts).values({
      accountId: staffId,
      providerId: "credential",
      userId: staffId,
      password: await hashPassword(ownerPassword),
    });
    const staffSignIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: staffEmail, password: ownerPassword }),
    });
    expect(staffSignIn.status).toBe(200);
    const staffCookie = staffSignIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    // Staff cannot promote to owner…
    const promote = await app.request(`/api/k/${slug}/admin/users/${staffId}/promote-to-owner`, {
      method: "POST",
      headers: { cookie: staffCookie, "content-type": "application/json" },
    });
    expect(promote.status).toBe(403);
    expect((await promote.json()).code).toBe("ONLY_OWNER_CAN_PROMOTE");

    // …nor delete an owner.
    const delOwner = await app.request(`/api/k/${slug}/admin/users/${ownerUserId}`, {
      method: "DELETE",
      headers: { cookie: staffCookie, "content-type": "application/json" },
    });
    expect(delOwner.status).toBe(403);
    expect((await delOwner.json()).code).toBe("ONLY_OWNER_CAN_DELETE_OWNER");

    // Even a superadmin (synthetic owner) cannot remove the LAST owner.
    const superEmail = `usr-super-la-${suffix}@example.com`;
    userEmails.push(superEmail);
    const [superUser] = await baseDb
      .insert(schema.users)
      .values({ email: superEmail, name: "Super LA", isSuperAdmin: true, emailVerified: true })
      .returning({ id: schema.users.id });
    await baseDb.insert(schema.accounts).values({
      accountId: must(superUser).id,
      providerId: "credential",
      userId: must(superUser).id,
      password: await hashPassword(ownerPassword),
    });
    const superSignIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: superEmail, password: ownerPassword }),
    });
    expect(superSignIn.status).toBe(200);
    const superCookie = superSignIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const delLastOwner = await app.request(`/api/k/${slug}/admin/users/${ownerUserId}`, {
      method: "DELETE",
      headers: { cookie: superCookie, "content-type": "application/json" },
    });
    expect(delLastOwner.status).toBe(400);
    expect((await delLastOwner.json()).code).toBe("LAST_OWNER_PROTECTION");
  });

  it("demote-to-staff: owner demotes a promoted owner, staff blocked, last owner protected", async () => {
    // Owner promotes a staff member to owner, then demotes them back to staff.
    const promotedId = await invitedStaff(`usr-demote-promoted-${suffix}@example.com`);
    const promote = await app.request(`/api/k/${slug}/admin/users/${promotedId}/promote-to-owner`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    expect(promote.status).toBe(200);

    const demote = await app.request(`/api/k/${slug}/admin/users/${promotedId}/demote-to-staff`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    expect(demote.status).toBe(200);

    const [demoted] = await db
      .select({ role: schema.tenantMemberships.role })
      .from(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.userId, promotedId),
          eq(schema.tenantMemberships.tenantId, tenantId),
        ),
      );
    expect(must(demoted).role).toBe("staff");

    // A plain staff member cannot demote an owner.
    const actorEmail = `usr-demote-actor-${suffix}@example.com`;
    const actorId = await invitedStaff(actorEmail);
    await baseDb.insert(schema.accounts).values({
      accountId: actorId,
      providerId: "credential",
      userId: actorId,
      password: await hashPassword(ownerPassword),
    });
    const actorSignIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: actorEmail, password: ownerPassword }),
    });
    expect(actorSignIn.status).toBe(200);
    const actorCookie = actorSignIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const staffDemote = await app.request(
      `/api/k/${slug}/admin/users/${ownerUserId}/demote-to-staff`,
      { method: "POST", headers: { cookie: actorCookie, "content-type": "application/json" } },
    );
    expect(staffDemote.status).toBe(403);
    expect((await staffDemote.json()).code).toBe("ONLY_OWNER_CAN_PROMOTE");

    // The original owner is now the last one — demoting them is blocked.
    const lastOwner = await app.request(
      `/api/k/${slug}/admin/users/${ownerUserId}/demote-to-staff`,
      { method: "POST", headers: { cookie, "content-type": "application/json" } },
    );
    expect(lastOwner.status).toBe(400);
    expect((await lastOwner.json()).code).toBe("LAST_OWNER_PROTECTION");
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
    expect(must(tokens[0]).identifier).not.toBe("reset-password:stale-token-xyz");
    expect(must(tokens[0]).identifier.startsWith("reset-password:")).toBe(true);

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
