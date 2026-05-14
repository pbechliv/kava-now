import { Hono } from "hono";
import { eq, and, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/connection";
import { users, verifications } from "../../db/schema/index";
import { inviteUserToKava, InviteConflict } from "../../services/invite-user";
import { logAudit } from "../../services/audit";
import { auth } from "../../auth";
import type { AppEnv } from "../../types";

const usersRouter = new Hono<AppEnv>();

// Customers are managed via /admin/customers (which provisions the linked
// customer-user). This endpoint only invites staff.
const inviteSchema = z.object({
  email: z.email("Μη έγκυρο email"),
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
  role: z.enum(["staff"], { error: "Επιλέξτε ρόλο" }),
});

// GET / — list users in current kava
usersRouter.get("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const inviter = alias(users, "inviter");

  const rows = await db
    .select({
      id: users.id,
      email: users.realEmail,
      emailVerified: users.emailVerified,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      invitedById: users.invitedById,
      invitedByName: inviter.name,
      invitedByEmail: inviter.realEmail,
    })
    .from(users)
    .leftJoin(inviter, eq(users.invitedById, inviter.id))
    .where(eq(users.kavaId, kavaId))
    .orderBy(users.createdAt);

  return c.json({ users: rows });
});

// POST /invite — invite a staff user
usersRouter.post("/invite", async (c) => {
  const kavaId = c.get("kavaId")!;
  const inviter = c.get("user")!;
  const body = await c.req.json();
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  try {
    await inviteUserToKava({
      c,
      kavaId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      inviterId: inviter.id,
    });
  } catch (err) {
    if (err instanceof InviteConflict) {
      return c.json({ error: err.message }, 409);
    }
    throw err;
  }

  await logAudit(c, {
    action: "user.invite",
    targetType: "user",
    metadata: {
      email: parsed.data.email,
      role: parsed.data.role,
    },
  });

  return c.json({ success: true });
});

// POST /:id/resend-invite — re-issue the magic link for a pending user
usersRouter.post("/:id/resend-invite", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  const [target] = await db
    .select({
      id: users.id,
      authEmail: users.email,
      realEmail: users.realEmail,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.kavaId, kavaId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
  }

  if (target.emailVerified) {
    return c.json({ error: "Ο χρήστης έχει ήδη ενεργοποιηθεί" }, 400);
  }

  // Invalidate any outstanding magic-link tokens so the new email is the only
  // working link. better-auth stores hashed tokens under the same identifier.
  await db.delete(verifications).where(eq(verifications.identifier, target.authEmail));

  const requestHost = c.req.header("x-forwarded-host") || c.req.header("host") || "";
  const protocol = requestHost.includes("localhost") ? "http" : "https";
  const callbackURL = `${protocol}://${requestHost}/welcome`;

  await auth.api.signInMagicLink({
    body: { email: target.authEmail, callbackURL },
    headers: c.req.raw.headers,
  });

  await logAudit(c, {
    action: "user.invite.resend",
    targetType: "user",
    targetId: id,
    metadata: { email: target.realEmail },
  });

  return c.json({ success: true });
});

// POST /:id/promote-to-owner — promote a staff user to owner
usersRouter.post("/:id/promote-to-owner", async (c) => {
  const kavaId = c.get("kavaId")!;
  const me = c.get("user")!;
  const id = c.req.param("id");

  if (me.role !== "owner") {
    return c.json({ error: "Μόνο ιδιοκτήτης μπορεί να προωθήσει σε ιδιοκτήτη" }, 403);
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, realEmail: users.realEmail })
    .from(users)
    .where(and(eq(users.id, id), eq(users.kavaId, kavaId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
  }

  if (target.role === "owner") {
    return c.json({ success: true });
  }

  if (target.role !== "staff") {
    return c.json({ error: "Μόνο χρήστες προσωπικού μπορούν να προωθηθούν σε ιδιοκτήτη" }, 400);
  }

  await db.update(users).set({ role: "owner" }).where(eq(users.id, id));

  await logAudit(c, {
    action: "user.promote",
    targetType: "user",
    targetId: id,
    metadata: { email: target.realEmail, newRole: "owner" },
  });

  return c.json({ success: true });
});

// DELETE /:id — remove a user from this kava
usersRouter.delete("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const me = c.get("user")!;
  const id = c.req.param("id");

  if (id === me.id) {
    return c.json({ error: "Δεν μπορείτε να διαγράψετε τον εαυτό σας" }, 400);
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, realEmail: users.realEmail })
    .from(users)
    .where(and(eq(users.id, id), eq(users.kavaId, kavaId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
  }

  if (target.role === "owner" && me.role !== "owner") {
    return c.json({ error: "Μόνο ιδιοκτήτης μπορεί να διαγράψει ιδιοκτήτη" }, 403);
  }

  // Prevent removing the final owner of the kava.
  if (target.role === "owner") {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.kavaId, kavaId), eq(users.role, "owner"), ne(users.id, id)));
    if (!remaining || remaining.count === 0) {
      return c.json(
        {
          error: "Δεν μπορείτε να διαγράψετε τον τελευταίο ιδιοκτήτη της κάβας",
        },
        400,
      );
    }
  }

  await db.delete(users).where(eq(users.id, id));

  await logAudit(c, {
    action: "user.delete",
    targetType: "user",
    targetId: id,
    metadata: { email: target.realEmail, role: target.role },
  });

  return c.json({ success: true });
});

export { usersRouter };
