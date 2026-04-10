import { Hono } from "hono";
import { eq, and, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { loginSchema } from "@kava-now/shared";
import { db } from "../db/connection";
import { users, magicLinkTokens, customers } from "../db/schema/index";
import { lucia } from "../auth/lucia";
import { sendMagicLink } from "../services/email";
import { config } from "../config";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

// POST /auth/login — request magic link
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const { email } = parsed.data;

  // Look up user by email + kava_id (no RLS needed, explicit filter)
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.kavaId, kava.id)))
    .limit(1);

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ success: true });
  }

  // Create magic link token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: kava.id,
    expiresAt,
  });

  const link = `${config.protocol}://${kava.slug}.${config.baseDomain}/auth/verify?token=${token}`;
  await sendMagicLink(email, link, kava.name);

  return c.json({ success: true });
});

// GET /auth/verify — verify magic link token
auth.get("/verify", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Λείπει το token" }, 400);
  }

  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  // Look up unused, unexpired token for this kava
  const [magicLink] = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.token, token),
        eq(magicLinkTokens.kavaId, kava.id),
        eq(magicLinkTokens.used, false),
        gt(magicLinkTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!magicLink) {
    return c.json({ error: "Μη έγκυρο ή ληγμένο token" }, 400);
  }

  // Mark token as used
  await db
    .update(magicLinkTokens)
    .set({ used: true })
    .where(eq(magicLinkTokens.id, magicLink.id));

  // Check if user already exists
  let [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.email, magicLink.email), eq(users.kavaId, kava.id)),
    )
    .limit(1);

  // If no user, check for customer with that email and auto-create user
  if (!user) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.email, magicLink.email),
          eq(customers.kavaId, kava.id),
        ),
      )
      .limit(1);

    if (customer) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: magicLink.email,
          name: customer.name,
          role: "customer",
          kavaId: kava.id,
          customerId: customer.id,
        })
        .returning();
      user = newUser!;
    }
  }

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  // Create session
  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  c.header("Set-Cookie", cookie.serialize(), { append: true });

  // Determine redirect based on role
  let redirect = "/";
  if (user.role === "owner" || user.role === "staff") {
    redirect = "/admin/dashboard";
  } else if (user.role === "customer") {
    redirect = "/catalog";
  }

  return c.json({ success: true, redirect, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// POST /auth/logout
auth.post("/logout", async (c) => {
  const sessionId = c.get("sessionId");

  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }

  const cookie = lucia.createBlankSessionCookie();
  c.header("Set-Cookie", cookie.serialize(), { append: true });

  return c.json({ success: true });
});

// GET /auth/me — current user info
auth.get("/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const kava = c.get("kava");

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    kava: kava
      ? {
          id: kava.id,
          name: kava.name,
          slug: kava.slug,
        }
      : null,
  });
});

export { auth as authRoutes };
