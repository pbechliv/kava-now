import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { Context } from "hono";
import type { AppEnv } from "../types";

// Integration tests against a live Postgres (same gate as the RLS suite).
// users / tenant_memberships / tenants have no RLS, so the app role can
// write them freely.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

// Must be set before any app module is (dynamically) imported.
if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

// No SMTP in CI — emails are mocked. Send failures must never affect the
// persisted membership anyway (asserted below).
vi.mock("./email", () => ({
  sendPasswordSet: vi.fn().mockResolvedValue(undefined),
  sendMembershipAdded: vi.fn().mockResolvedValue(undefined),
  sendOrderNotification: vi.fn().mockResolvedValue(undefined),
  sendOrderStatusChange: vi.fn().mockResolvedValue(undefined),
}));

// inviteUserToTenant only reads c.req.raw.headers (forwarded to better-auth).
const fakeContext = {
  req: { raw: { headers: new Headers() } },
} as unknown as Context<AppEnv>;

suite("inviteUserToTenant (invite-only user creation)", () => {
  let inviteUserToTenant: typeof import("./invite-user").inviteUserToTenant;
  let InviteConflict: typeof import("./invite-user").InviteConflict;
  let db: typeof import("../db/connection").db;
  let baseDb: typeof import("../db/connection").baseDb;
  let queryClient: typeof import("../db/connection").queryClient;
  let schema: typeof import("../db/schema/index");
  let email: typeof import("./email");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  let tenantA = "";
  let tenantB = "";
  const userEmails: string[] = [];

  beforeAll(async () => {
    ({ inviteUserToTenant, InviteConflict } = await import("./invite-user"));
    const conn = await import("../db/connection");
    ({ db, baseDb, queryClient } = conn);
    schema = await import("../db/schema/index");
    email = await import("./email");

    const [a] = await baseDb
      .insert(schema.tenants)
      .values({ name: "Invite A", slug: `inv-a-${suffix}`, email: "a@example.com" })
      .returning({ id: schema.tenants.id });
    const [b] = await baseDb
      .insert(schema.tenants)
      .values({ name: "Invite B", slug: `inv-b-${suffix}`, email: "b@example.com" })
      .returning({ id: schema.tenants.id });
    tenantA = a!.id;
    tenantB = b!.id;
  });

  afterAll(async () => {
    if (baseDb && tenantA && tenantB) {
      await baseDb.delete(schema.tenants).where(inArray(schema.tenants.id, [tenantA, tenantB]));
    }
    if (baseDb && userEmails.length) {
      await baseDb.delete(schema.users).where(inArray(schema.users.email, userEmails));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  async function membershipsOf(emailAddr: string) {
    return db
      .select({
        tenantId: schema.tenantMemberships.tenantId,
        role: schema.tenantMemberships.role,
        customerId: schema.tenantMemberships.customerId,
      })
      .from(schema.tenantMemberships)
      .innerJoin(schema.users, eq(schema.tenantMemberships.userId, schema.users.id))
      .where(eq(schema.users.email, emailAddr));
  }

  it("new email → creates a passwordless user + membership and sends the set-password invite", async () => {
    const addr = `inv-new-${suffix}@example.com`;
    userEmails.push(addr);

    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantA,
      email: addr,
      name: "New Invitee",
      role: "staff",
    });

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, addr));
    expect(user).toBeTruthy();

    // No credential account — the invite is the only path to a password.
    const accts = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, user!.id));
    expect(accts).toHaveLength(0);

    const memberships = await membershipsOf(addr);
    expect(memberships).toEqual([{ tenantId: tenantA, role: "staff", customerId: null }]);

    // Invite email dispatched through better-auth's sendResetPassword. The
    // /welcome redirect rides in the (URL-encoded) callbackURL param — it's
    // what selects the "invite" copy over the "reset" copy.
    expect(email.sendPasswordSet).toHaveBeenCalledWith(
      addr,
      expect.stringContaining("welcome"),
      "KavaNow",
      "invite",
    );
  });

  it("existing user → adds the membership only and sends the added-to-tenant note", async () => {
    const addr = `inv-existing-${suffix}@example.com`;
    userEmails.push(addr);

    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantA,
      email: addr,
      name: "Multi Tenant",
      role: "staff",
    });
    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantB,
      email: addr,
      name: "Multi Tenant",
      role: "owner",
    });

    // Still one users row, two memberships with per-tenant roles.
    const usersRows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, addr));
    expect(usersRows).toHaveLength(1);

    const memberships = await membershipsOf(addr);
    expect(memberships).toHaveLength(2);
    expect(memberships.find((m) => m.tenantId === tenantB)?.role).toBe("owner");
    expect(email.sendMembershipAdded).toHaveBeenCalledWith(
      addr,
      expect.stringContaining(`/k/inv-b-${suffix}/login`),
      "Invite B",
    );
  });

  it("re-inviting the same email to the same tenant → InviteConflict, no duplicate membership", async () => {
    const addr = `inv-dup-${suffix}@example.com`;
    userEmails.push(addr);

    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantA,
      email: addr,
      name: "Dup",
      role: "staff",
    });
    await expect(
      inviteUserToTenant({
        c: fakeContext,
        tenantId: tenantA,
        email: addr,
        name: "Dup",
        role: "owner",
      }),
    ).rejects.toThrow(InviteConflict);

    const memberships = await membershipsOf(addr);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("staff");
  });

  it("membership persists even when the notification email fails (best-effort send)", async () => {
    const addr = `inv-mailfail-${suffix}@example.com`;
    userEmails.push(addr);

    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantA,
      email: addr,
      name: "Mail Fail",
      role: "staff",
    });

    vi.mocked(email.sendMembershipAdded).mockRejectedValueOnce(new Error("smtp down"));
    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantB,
      email: addr,
      name: "Mail Fail",
      role: "staff",
    });

    const memberships = await membershipsOf(addr);
    expect(memberships.map((m) => m.tenantId).sort()).toEqual([tenantA, tenantB].sort());
  });

  it("a conflicting invite inside a tenant transaction doesn't poison it (#46)", async () => {
    const addr = `inv-txsafe-${suffix}@example.com`;
    userEmails.push(addr);

    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantA,
      email: addr,
      name: "TX Safe",
      role: "staff",
    });

    // Inside ONE tenant transaction: write a row, then hit the membership
    // unique violation. The violation must roll back only its savepoint —
    // the sibling write has to survive the outer COMMIT.
    const { runWithTenant } = await import("../db/connection");
    await runWithTenant(tenantA, async () => {
      await db.insert(schema.customers).values({ tenantId: tenantA, name: "TX Survivor" });
      await expect(
        inviteUserToTenant({
          c: fakeContext,
          tenantId: tenantA,
          email: addr,
          name: "TX Safe",
          role: "staff",
        }),
      ).rejects.toThrow(InviteConflict);
    });

    const survivors = await runWithTenant(tenantA, () =>
      db
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(eq(schema.customers.name, "TX Survivor")),
    );
    expect(survivors).toHaveLength(1);
  });

  it("memberships can carry a customer link (customer role)", async () => {
    const addr = `inv-cust-${suffix}@example.com`;
    userEmails.push(addr);

    // customers is RLS-scoped — create within tenant context.
    const { runWithTenant } = await import("../db/connection");
    const customer = await runWithTenant(tenantA, async () => {
      const [row] = await db
        .insert(schema.customers)
        .values({ tenantId: tenantA, name: "Linked Customer" })
        .returning({ id: schema.customers.id });
      return row!;
    });

    await inviteUserToTenant({
      c: fakeContext,
      tenantId: tenantA,
      email: addr,
      name: "Customer User",
      role: "customer",
      customerId: customer.id,
    });

    const memberships = await membershipsOf(addr);
    expect(memberships).toEqual([{ tenantId: tenantA, role: "customer", customerId: customer.id }]);
  });
});
