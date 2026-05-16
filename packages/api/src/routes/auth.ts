import { Hono } from "hono";
import { eq, ne, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/connection";
import { accounts, kavaMemberships, kavas, users } from "../db/schema/index";
import { auth as betterAuth } from "../auth";
import { requireAuth } from "../middleware/require-auth";
import { logAudit } from "../services/audit";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

const setPasswordSchema = z.object({
  newPassword: z.string().min(8, "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες"),
});

// POST /set-password — set initial password for a user without a credential
// account. Better-auth's setPassword API is server-only by design, so we expose
// it through our own authenticated endpoint.
auth.post("/set-password", requireAuth, async (c) => {
  const body = await c.req.json();
  const parsed = setPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  await betterAuth.api.setPassword({
    body: { newPassword: parsed.data.newPassword },
    headers: c.req.raw.headers,
  });
  await logAudit(c, { action: "auth.set-password" });
  return c.json({ success: true });
});

auth.get("/me", requireAuth, async (c) => {
  const authUser = c.get("user")!;

  const [credentialAccount] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, authUser.id))
    .limit(1);

  // All kavas this user is a member of, with role + linked customer (if any).
  const inviter = alias(users, "inviter");
  const rows = await db
    .select({
      kavaId: kavaMemberships.kavaId,
      kavaSlug: kavas.slug,
      kavaName: kavas.name,
      role: kavaMemberships.role,
      customerId: kavaMemberships.customerId,
      invitedByName: inviter.name,
      invitedByEmail: inviter.email,
    })
    .from(kavaMemberships)
    .innerJoin(kavas, eq(kavas.id, kavaMemberships.kavaId))
    .leftJoin(inviter, eq(inviter.id, kavaMemberships.invitedById))
    .where(eq(kavaMemberships.userId, authUser.id))
    .orderBy(kavas.name);

  const memberships = rows.map((r) => ({
    kavaId: r.kavaId,
    kavaSlug: r.kavaSlug,
    kavaName: r.kavaName,
    role: r.role,
    customerId: r.customerId,
    invitedBy: r.invitedByName ? { name: r.invitedByName, email: r.invitedByEmail ?? "" } : null,
  }));

  return c.json({
    user: {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      isSuperAdmin: !!authUser.isSuperAdmin,
      hasPassword: !!credentialAccount,
    },
    memberships,
  });
});

const updateMeSchema = z.object({
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες").optional(),
  email: z.email("Μη έγκυρο email").optional(),
});

// PATCH /me — edit the current user's name and/or email.
auth.patch("/me", requireAuth, async (c) => {
  const authUser = c.get("user")!;
  const body = await c.req.json();
  const parsed = updateMeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  if (!parsed.data.name && !parsed.data.email) {
    return c.json({ error: "Δεν δόθηκαν πεδία για ενημέρωση" }, 400);
  }

  const updateData: { name?: string; email?: string } = {};

  if (parsed.data.name) {
    updateData.name = parsed.data.name;
  }

  if (parsed.data.email && parsed.data.email !== authUser.email) {
    const newEmail = parsed.data.email;
    const [collision] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, newEmail), ne(users.id, authUser.id)))
      .limit(1);
    if (collision) {
      return c.json({ error: "Αυτό το email χρησιμοποιείται ήδη" }, 409);
    }
    updateData.email = newEmail;
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ success: true });
  }

  try {
    await db.update(users).set(updateData).where(eq(users.id, authUser.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return c.json({ error: "Αυτό το email χρησιμοποιείται ήδη" }, 409);
    }
    throw err;
  }

  await logAudit(c, {
    action: "user.profile.update",
    targetType: "user",
    targetId: authUser.id,
    metadata: { fields: Object.keys(updateData) },
  });

  return c.json({ success: true });
});

export { auth as authRoutes };
