import { Hono } from "hono";
import { eq, ne, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { API_ERROR_CODES, normalizeEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { accounts, tenantMemberships, tenants, users } from "../db/schema/index";
import { verifyPassword } from "better-auth/crypto";
import { auth as betterAuth } from "../auth";
import { requireAuth } from "../middleware/require-auth";
import { isUniqueViolation, UNIQUE_CONSTRAINTS } from "../db/errors";
import type { AppEnv } from "../types";

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
  const authUser = c.get("user")!;

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
  const authUser = c.get("user")!;
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

export { auth as authRoutes };
