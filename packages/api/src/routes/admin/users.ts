import { Hono } from "hono";
import { eq, and, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { API_ERROR_CODES, inviteStaffUserSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { accounts, tenantMemberships, users } from "../../db/schema/index";
import {
  inviteUserToTenant,
  resendSetPasswordInvite,
  InviteConflict,
} from "../../services/invite-user";
import type { AppEnv } from "../../types";
import { getMembership, getTenant, getTenantId, getUser } from "../../context";

const usersRouter = new Hono<AppEnv>();

// GET / — list users with a non-customer membership in this tenant (owners + staff)
usersRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);
  const inviter = alias(users, "inviter");

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      name: users.name,
      role: tenantMemberships.role,
      createdAt: tenantMemberships.createdAt,
      invitedById: tenantMemberships.invitedById,
      invitedByName: inviter.name,
      invitedByEmail: inviter.email,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .leftJoin(inviter, eq(tenantMemberships.invitedById, inviter.id))
    .where(and(eq(tenantMemberships.tenantId, tenantId), ne(tenantMemberships.role, "customer")))
    .orderBy(tenantMemberships.createdAt);

  return c.json({ users: rows });
});

// POST /invite — invite a staff user
usersRouter.post("/invite", async (c) => {
  const tenantId = getTenantId(c);
  const inviter = getUser(c);
  const body = await c.req.json();
  const parsed = inviteStaffUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  try {
    await inviteUserToTenant({
      c,
      tenantId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      inviterId: inviter.id,
    });
  } catch (err) {
    if (err instanceof InviteConflict) {
      return c.json({ code: err.code, error: err.message }, 409);
    }
    throw err;
  }

  return c.json({ success: true });
});

// POST /:id/resend-invite — re-issue the set-password invite for a pending user
usersRouter.post("/:id/resend-invite", async (c) => {
  const result = await resendSetPasswordInvite({
    c,
    tenantId: getTenantId(c),
    tenantSlug: getTenant(c).slug,
    userId: c.req.param("id"),
  });
  if (!result.ok) {
    return c.json({ code: result.code, error: result.error }, result.status);
  }
  return c.json({ success: true });
});

// POST /:id/promote-to-owner — promote a staff member to owner
usersRouter.post("/:id/promote-to-owner", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const myMembership = getMembership(c);

  if (myMembership.role !== "owner") {
    return c.json(
      { code: API_ERROR_CODES.ONLY_OWNER_CAN_PROMOTE, error: "Only an owner can promote to owner" },
      403,
    );
  }

  const [target] = await db
    .select({ id: users.id, email: users.email, role: tenantMemberships.role })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }
  if (target.role === "owner") {
    return c.json({ success: true });
  }
  if (target.role !== "staff") {
    return c.json(
      {
        code: API_ERROR_CODES.ONLY_STAFF_PROMOTABLE,
        error: "Only staff users can be promoted to owner",
      },
      400,
    );
  }

  await db
    .update(tenantMemberships)
    .set({ role: "owner" })
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)));

  return c.json({ success: true });
});

// DELETE /:id — remove a user's membership in this tenant
usersRouter.delete("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const me = getUser(c);
  const myMembership = getMembership(c);
  const id = c.req.param("id");

  if (id === me.id) {
    return c.json(
      { code: API_ERROR_CODES.CANT_DELETE_SELF, error: "You cannot delete yourself" },
      400,
    );
  }

  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      role: tenantMemberships.role,
      isSuperAdmin: users.isSuperAdmin,
      invitedById: tenantMemberships.invitedById,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  if (target.role === "owner" && myMembership.role !== "owner") {
    return c.json(
      {
        code: API_ERROR_CODES.ONLY_OWNER_CAN_DELETE_OWNER,
        error: "Only an owner can delete an owner",
      },
      403,
    );
  }

  // Prevent removing the final owner of the tenant.
  if (target.role === "owner") {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.role, "owner"),
          ne(tenantMemberships.userId, id),
        ),
      );
    if (!remaining || remaining.count === 0) {
      return c.json(
        {
          code: API_ERROR_CODES.LAST_OWNER_PROTECTION,
          error: "Cannot delete the last owner of the tenant",
        },
        400,
      );
    }
  }

  await db
    .delete(tenantMemberships)
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)));

  // Clean up the global account only for orphaned invitees: invited into this
  // tenant, never activated (no credential or OAuth account row), and with no
  // memberships left anywhere. A user who has signed in — or a superadmin —
  // owns their account; a tenant admin has no authority to destroy it.
  if (target.invitedById !== null && !target.isSuperAdmin) {
    const [remainingForUser] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, id));
    const [accountRow] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, id))
      .limit(1);
    if (remainingForUser && remainingForUser.count === 0 && !accountRow) {
      // accounts/sessions cascade via FK; nothing to sign in with existed anyway
      await db.delete(users).where(eq(users.id, id));
    }
  }

  return c.json({ success: true });
});

export { usersRouter };
