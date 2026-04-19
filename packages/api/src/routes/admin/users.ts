import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { encodeAuthEmail } from "@kava-now/shared";
import { db } from "../../db/connection";
import { users, customers, kavas } from "../../db/schema/index";
import { auth } from "../../auth";
import type { AppEnv } from "../../types";

const usersRouter = new Hono<AppEnv>();

const inviteSchema = z.object({
  email: z.email("Μη έγκυρο email"),
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
  role: z.enum(["staff", "customer"], {
    error: "Επιλέξτε ρόλο",
  }),
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

// POST /invite — create user with role + send magic-link
usersRouter.post("/invite", async (c) => {
  const kavaId = c.get("kavaId")!;
  const inviter = c.get("user")!;
  const body = await c.req.json();
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { email: realEmail, name, role } = parsed.data;

  const [{ slug: kavaSlug } = { slug: null as string | null }] = await db
    .select({ slug: kavas.slug })
    .from(kavas)
    .where(eq(kavas.id, kavaId))
    .limit(1);

  if (!kavaSlug) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 404);
  }

  const authEmail = encodeAuthEmail(realEmail, kavaSlug);

  // Per-kava email uniqueness — only block if this real email already exists
  // in THIS kava. Same email can be reused across other kavas.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.realEmail, realEmail), eq(users.kavaId, kavaId)))
    .limit(1);

  if (existing) {
    return c.json(
      { error: "Αυτό το email χρησιμοποιείται ήδη σε αυτήν την κάβα" },
      409,
    );
  }

  // For customers, also link to a customers row (create one if none exists for this email + kava)
  let customerId: string | null = null;
  if (role === "customer") {
    const [existingCustomer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.email, realEmail), eq(customers.kavaId, kavaId)))
      .limit(1);

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const [newCustomer] = await db
        .insert(customers)
        .values({ kavaId, name, email: realEmail })
        .returning({ id: customers.id });
      customerId = newCustomer!.id;
    }
  }

  await db.insert(users).values({
    email: authEmail,
    realEmail,
    name,
    role,
    kavaId,
    customerId,
    invitedById: inviter.id,
  });

  // Send magic link → invitee lands on /welcome where they can set a password.
  // Build an absolute callbackURL using the request's host so the post-verify
  // redirect lands on the right subdomain (better-auth's static baseURL would
  // otherwise drop the subdomain).
  const requestHost =
    c.req.header("x-forwarded-host") || c.req.header("host") || "";
  const protocol = requestHost.includes("localhost") ? "http" : "https";
  const callbackURL = `${protocol}://${requestHost}/welcome`;

  await auth.api.signInMagicLink({
    body: { email: authEmail, callbackURL },
    headers: c.req.raw.headers,
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
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, id), eq(users.kavaId, kavaId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
  }

  // Don't let staff delete owners (we'll formalize role hierarchy later)
  if (target.role === "owner" && me.role !== "owner") {
    return c.json({ error: "Μόνο ιδιοκτήτης μπορεί να διαγράψει ιδιοκτήτη" }, 403);
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ success: true });
});

export { usersRouter };
