import { Hono } from "hono";
import { eq, ne, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { API_ERROR_CODES, normalizeEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { config } from "../config";
import { accounts, pushSubscriptions, tenantMemberships, tenants, users } from "../db/schema/index";
import { verifyPassword } from "better-auth/crypto";
import { auth as betterAuth } from "../auth";
import { requireAuth } from "../middleware/require-auth";
import { isUniqueViolation, UNIQUE_CONSTRAINTS } from "../db/errors";
import type { AppEnv } from "../types";
import { getUser } from "../context";

const DUPLICATE_USER_EMAIL_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_USER_EMAIL,
  error: "Email is already in use by another user",
} as const;

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
  return c.json({ success: true });
});

auth.get("/me", requireAuth, async (c) => {
  const authUser = getUser(c);

  const [credentialAccount] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, authUser.id), eq(accounts.providerId, "credential")))
    .limit(1);

  // All tenants this user is a member of, with role + linked customer (if any).
  const inviter = alias(users, "inviter");
  const rows = await db
    .select({
      tenantId: tenantMemberships.tenantId,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      role: tenantMemberships.role,
      customerId: tenantMemberships.customerId,
      notifyAllOrders: tenantMemberships.notifyAllOrders,
      invitedByName: inviter.name,
      invitedByEmail: inviter.email,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .leftJoin(inviter, eq(inviter.id, tenantMemberships.invitedById))
    .where(eq(tenantMemberships.userId, authUser.id))
    .orderBy(tenants.name);

  const memberships = rows.map((r) => ({
    tenantId: r.tenantId,
    tenantSlug: r.tenantSlug,
    tenantName: r.tenantName,
    role: r.role,
    customerId: r.customerId,
    notifyAllOrders: r.notifyAllOrders,
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
  currentPassword: z.string().optional(),
});

// PATCH /me — edit the current user's name and/or email.
auth.patch("/me", requireAuth, async (c) => {
  const authUser = getUser(c);
  const body = await c.req.json();
  const parsed = updateMeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  if (!parsed.data.name && !parsed.data.email) {
    return c.json(
      { code: API_ERROR_CODES.NO_UPDATE_FIELDS, error: "No fields provided to update" },
      400,
    );
  }

  const updateData: { name?: string; email?: string; emailVerified?: boolean } = {};

  if (parsed.data.name) {
    updateData.name = parsed.data.name;
  }

  const normalizedNewEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : undefined;
  if (normalizedNewEmail && normalizedNewEmail !== authUser.email) {
    // Rebinding the account email redirects all future password resets — a
    // hijacked session must not be enough to take the account over (#48).
    // Proof of ownership = the current password.
    const [credential] = await db
      .select({ hash: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, authUser.id), eq(accounts.providerId, "credential")))
      .limit(1);

    if (!credential?.hash) {
      // OAuth-only account: email is bound to the provider identity; changing
      // it here would break the sign-in match and can't be password-verified.
      return c.json(
        {
          code: API_ERROR_CODES.EMAIL_CHANGE_REQUIRES_PASSWORD,
          error: "Email can only be changed on accounts with a password",
        },
        400,
      );
    }
    if (
      !parsed.data.currentPassword ||
      !(await verifyPassword({ hash: credential.hash, password: parsed.data.currentPassword }))
    ) {
      return c.json(
        {
          code: API_ERROR_CODES.INVALID_CURRENT_PASSWORD,
          error: "Current password is missing or incorrect",
        },
        403,
      );
    }

    const newEmail = normalizedNewEmail;
    const [collision] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, newEmail), ne(users.id, authUser.id)))
      .limit(1);
    if (collision) {
      return c.json(DUPLICATE_USER_EMAIL_RESPONSE, 409);
    }
    updateData.email = newEmail;
    updateData.emailVerified = false;
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ success: true });
  }

  try {
    await db.update(users).set(updateData).where(eq(users.id, authUser.id));
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.userEmail)) {
      return c.json(DUPLICATE_USER_EMAIL_RESPONSE, 409);
    }
    throw err;
  }

  return c.json({ success: true });
});

// --- Web Push (#28) ---

const pushSubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// Public by design: the VAPID public key is not a secret. null → feature off,
// and the web toggle hides itself.
auth.get("/push/public-key", (c) =>
  c.json({ publicKey: config.push.enabled ? config.push.publicKey : null }),
);

auth.post("/push/subscribe", requireAuth, async (c) => {
  if (!config.push.enabled) {
    return c.json({ error: "Push notifications are not configured" }, 503);
  }
  const parsed = pushSubscribeSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const user = getUser(c);

  // The endpoint is the natural key — a browser re-subscribing (possibly as a
  // different account on a shared machine) re-binds the row to the new user.
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: c.req.header("user-agent") ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
    });

  return c.json({ success: true });
});

auth.post("/push/unsubscribe", requireAuth, async (c) => {
  const parsed = z.object({ endpoint: z.url() }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const user = getUser(c);
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, parsed.data.endpoint),
        eq(pushSubscriptions.userId, user.id),
      ),
    );
  return c.json({ success: true });
});

export { auth as authRoutes };
