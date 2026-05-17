import { Hono } from "hono";
import { eq, and, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { API_ERROR_CODES } from "@kava-now/shared";
import { db } from "../../db/connection";
import { accounts, tenantMemberships, users, verifications } from "../../db/schema/index";
import {
  inviteUserToTenant,
  sendInviteSetPassword,
  InviteConflict,
  userHasPassword,
} from "../../services/invite-user";
import { logAudit } from "../../services/audit";
import type { AppEnv } from "../../types";

const usersRouter = new Hono<AppEnv>();

// Customers are managed via /admin/customers (which provisions the linked
// customer-user). This endpoint only invites staff.
const inviteSchema = z.object({
  email: z.email("Μη έγκυρο email"),
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
  role: z.enum(["staff"], { error: "Επιλέξτε ρόλο" }),
});

// GET / — list users with a non-customer membership in this tenant (owners + staff)
usersRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
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
  const tenantId = c.get("tenantId")!;
  const inviter = c.get("user")!;
  const body = await c.req.json();
  const parsed = inviteSchema.safeParse(body);

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

  await logAudit(c, {
    action: "user.invite",
    targetType: "user",
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  return c.json({ success: true });
});

// POST /:id/resend-invite — re-issue the set-password invite for a pending user
usersRouter.post("/:id/resend-invite", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");

  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  if (await userHasPassword(target.id)) {
    return c.json({ code: API_ERROR_CODES.USER_ALREADY_ACTIVATED, error: "User is already activated" }, 400);
  }

  // Invalidate any outstanding reset tokens so the new email is the only
  // working link. better-auth stores hashed tokens under the same identifier.
  await db.delete(verifications).where(eq(verifications.identifier, target.email));

  await sendInviteSetPassword(c, target.email, c.get("tenant")!.slug);

  await logAudit(c, {
    action: "user.invite.resend",
    targetType: "user",
    targetId: id,
    metadata: { email: target.email },
  });

  return c.json({ success: true });
});

// POST /:id/promote-to-owner — promote a staff member to owner
usersRouter.post("/:id/promote-to-owner", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const myMembership = c.get("membership")!;

  if (myMembership.role !== "owner") {
    return c.json({ code: API_ERROR_CODES.ONLY_OWNER_CAN_PROMOTE, error: "Only an owner can promote to owner" }, 403);
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
    return c.json({ code: API_ERROR_CODES.ONLY_STAFF_PROMOTABLE, error: "Only staff users can be promoted to owner" }, 400);
  }

  await db
    .update(tenantMemberships)
    .set({ role: "owner" })
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)));

  await logAudit(c, {
    action: "user.promote",
    targetType: "user",
    targetId: id,
    metadata: { email: target.email, newRole: "owner" },
  });

  return c.json({ success: true });
});

// DELETE /:id — remove a user's membership in this tenant
usersRouter.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const me = c.get("user")!;
  const myMembership = c.get("membership")!;
  const id = c.req.param("id");

  if (id === me.id) {
    return c.json({ code: API_ERROR_CODES.CANT_DELETE_SELF, error: "You cannot delete yourself" }, 400);
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

  if (target.role === "owner" && myMembership.role !== "owner") {
    return c.json({ code: API_ERROR_CODES.ONLY_OWNER_CAN_DELETE_OWNER, error: "Only an owner can delete an owner" }, 403);
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
        { code: API_ERROR_CODES.LAST_OWNER_PROTECTION, error: "Cannot delete the last owner of the tenant" },
        400,
      );
    }
  }

  await db
    .delete(tenantMemberships)
    .where(and(eq(tenantMemberships.userId, id), eq(tenantMemberships.tenantId, tenantId)));

  // If this was the user's last membership, also delete the credential row
  // and user — keeps the global account list tidy for orphans created by
  // earlier invites.
  const [remainingForUser] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, id));
  if (remainingForUser && remainingForUser.count === 0) {
    await db.delete(accounts).where(eq(accounts.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  await logAudit(c, {
    action: "user.delete",
    targetType: "user",
    targetId: id,
    metadata: { email: target.email, role: target.role },
  });

  return c.json({ success: true });
});

export { usersRouter };
