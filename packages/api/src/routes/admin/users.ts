import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/connection";
import { users } from "../../db/schema/index";
import { inviteUserToKava, InviteConflict } from "../../services/invite-user";
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
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, id), eq(users.kavaId, kavaId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
  }

  if (target.role === "owner" && me.role !== "owner") {
    return c.json({ error: "Μόνο ιδιοκτήτης μπορεί να διαγράψει ιδιοκτήτη" }, 403);
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ success: true });
});

export { usersRouter };
