import { Hono } from "hono";
import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@kava-now/shared";
import { db } from "../db/connection";
import { users, magicLinkTokens, customers } from "../db/schema/index";
import { lucia } from "../auth/lucia";
import { hashPassword, verifyPassword } from "../auth/password";
import { sendMagicLink, sendPasswordReset } from "../services/email";
import { config } from "../config";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

// POST /auth/login — password login or magic link request
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { email, password } = parsed.data;
  const isSuperAdmin = c.get("isSuperAdmin");

  // Superadmin login (admin subdomain)
  if (isSuperAdmin) {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, email),
          eq(users.role, "superadmin"),
          isNull(users.kavaId),
        ),
      )
      .limit(1);

    if (password) {
      if (!user || !user.passwordHash) {
        return c.json({ error: "Λάθος email ή κωδικός" }, 401);
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return c.json({ error: "Λάθος email ή κωδικός" }, 401);
      }

      const session = await lucia.createSession(user.id, {});
      const cookie = lucia.createSessionCookie(session.id);
      c.header("Set-Cookie", cookie.serialize(), { append: true });

      return c.json({
        success: true,
        redirect: "/superadmin/kavas",
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    }

    // Magic link for superadmin
    if (!user) {
      return c.json({ success: true });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(magicLinkTokens).values({
      email,
      token,
      expiresAt,
      purpose: "login",
    });

    const link = `${config.protocol}://admin.${config.baseDomain}/auth/verify?token=${token}`;
    await sendMagicLink(email, link, "KavaNow");

    return c.json({ success: true });
  }

  // Tenant login (existing logic)
  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.kavaId, kava.id)))
    .limit(1);

  if (password) {
    if (!user || !user.passwordHash) {
      return c.json({ error: "Λάθος email ή κωδικός" }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Λάθος email ή κωδικός" }, 401);
    }

    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    c.header("Set-Cookie", cookie.serialize(), { append: true });

    let redirect = "/";
    if (user.role === "owner" || user.role === "staff") {
      redirect = "/admin/dashboard";
    } else if (user.role === "customer") {
      redirect = "/catalog";
    }

    return c.json({
      success: true,
      redirect,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }

  if (!user) {
    // Check if email belongs to a customer (no user record yet — created on first verify)
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.email, email), eq(customers.kavaId, kava.id)),
      )
      .limit(1);

    if (!customer) {
      return c.json({ success: true });
    }
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: kava.id,
    expiresAt,
    purpose: "login",
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

  const isSuperAdmin = c.get("isSuperAdmin");
  const kava = c.get("kava");

  if (!kava && !isSuperAdmin) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const existingSessionId = c.get("sessionId");
  if (existingSessionId) {
    await lucia.invalidateSession(existingSessionId);
  }

  const conditions = [
    eq(magicLinkTokens.token, token),
    eq(magicLinkTokens.used, false),
    gt(magicLinkTokens.expiresAt, new Date()),
    eq(magicLinkTokens.purpose, "login"),
  ];
  if (kava) {
    conditions.push(eq(magicLinkTokens.kavaId, kava.id));
  } else {
    conditions.push(isNull(magicLinkTokens.kavaId));
  }

  const [magicLink] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(...conditions))
    .limit(1);

  if (!magicLink) {
    return c.json({ error: "Μη έγκυρο ή ληγμένο token" }, 400);
  }

  await db
    .update(magicLinkTokens)
    .set({ used: true })
    .where(eq(magicLinkTokens.id, magicLink.id));

  // For superadmin, look up by email + superadmin role
  if (isSuperAdmin) {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, magicLink.email),
          eq(users.role, "superadmin"),
          isNull(users.kavaId),
        ),
      )
      .limit(1);

    if (!user) {
      return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
    }

    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    c.header("Set-Cookie", cookie.serialize(), { append: true });

    return c.json({
      success: true,
      redirect: "/superadmin/kavas",
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }

  // Existing tenant verify logic
  let [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.email, magicLink.email), eq(users.kavaId, kava!.id)),
    )
    .limit(1);

  if (!user) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.email, magicLink.email),
          eq(customers.kavaId, kava!.id),
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
          kavaId: kava!.id,
          customerId: customer.id,
        })
        .returning();
      user = newUser!;
    }
  }

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  c.header("Set-Cookie", cookie.serialize(), { append: true });

  let redirect = "/";
  if (user.role === "owner" || user.role === "staff") {
    redirect = "/admin/dashboard";
  } else if (user.role === "customer") {
    redirect = "/catalog";
  }

  return c.json({ success: true, redirect, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// POST /auth/forgot-password
auth.post("/forgot-password", async (c) => {
  const body = await c.req.json();
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { email } = parsed.data;
  const isSuperAdmin = c.get("isSuperAdmin");
  const kava = c.get("kava");

  if (!kava && !isSuperAdmin) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const userConditions = [eq(users.email, email)];
  if (isSuperAdmin) {
    userConditions.push(eq(users.role, "superadmin"));
    userConditions.push(isNull(users.kavaId));
  } else {
    userConditions.push(eq(users.kavaId, kava!.id));
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(...userConditions))
    .limit(1);

  if (!user) {
    return c.json({ success: true });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: isSuperAdmin ? null : kava!.id,
    expiresAt,
    purpose: "reset",
  });

  const subdomain = isSuperAdmin ? "admin" : kava!.slug;
  const name = isSuperAdmin ? "KavaNow" : kava!.name;
  const link = `${config.protocol}://${subdomain}.${config.baseDomain}/auth/reset-password?token=${token}`;
  await sendPasswordReset(email, link, name);

  return c.json({ success: true });
});

// POST /auth/reset-password
auth.post("/reset-password", async (c) => {
  const body = await c.req.json();
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const isSuperAdmin = c.get("isSuperAdmin");
  const kava = c.get("kava");

  if (!kava && !isSuperAdmin) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const { token, password } = parsed.data;

  const tokenConditions = [
    eq(magicLinkTokens.token, token),
    eq(magicLinkTokens.used, false),
    eq(magicLinkTokens.purpose, "reset"),
    gt(magicLinkTokens.expiresAt, new Date()),
  ];
  if (kava) {
    tokenConditions.push(eq(magicLinkTokens.kavaId, kava.id));
  } else {
    tokenConditions.push(isNull(magicLinkTokens.kavaId));
  }

  const [magicLink] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(...tokenConditions))
    .limit(1);

  if (!magicLink) {
    return c.json({ error: "Μη έγκυρο ή ληγμένο token" }, 400);
  }

  await db
    .update(magicLinkTokens)
    .set({ used: true })
    .where(eq(magicLinkTokens.id, magicLink.id));

  const userConditions = [eq(users.email, magicLink.email)];
  if (isSuperAdmin) {
    userConditions.push(eq(users.role, "superadmin"));
    userConditions.push(isNull(users.kavaId));
  } else {
    userConditions.push(eq(users.kavaId, kava!.id));
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(...userConditions))
    .limit(1);

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  return c.json({ success: true });
});

// POST /auth/change-password (authenticated)
auth.post("/change-password", requireAuth, async (c) => {
  const body = await c.req.json();
  const parsed = changePasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const authUser = c.get("user")!;
  const { currentPassword, newPassword } = parsed.data;

  // Fetch the full user record with passwordHash
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  // If user already has a password, require current password
  if (user.passwordHash) {
    if (!currentPassword) {
      return c.json({ error: "Απαιτείται ο τρέχων κωδικός" }, 400);
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Λάθος τρέχων κωδικός" }, 401);
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  return c.json({ success: true });
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
  const authUser = c.get("user")!;

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  const kava = c.get("kava");

  return c.json({
    user: {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      hasPassword: !!user?.passwordHash,
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
