import { Hono } from "hono";
import { eq, and, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { encodeAuthEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { accounts, users } from "../db/schema/index";
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
  const kava = c.get("kava");

  const [credentialAccount] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, authUser.id))
    .limit(1);

  const inviter = alias(users, "inviter");

  // Look up the human-facing email from the row (better-auth's session
  // includes additionalFields, but explicitly fetching keeps this independent
  // of better-auth's projection.)
  const [row] = await db
    .select({
      realEmail: users.realEmail,
      invitedByName: inviter.name,
      invitedByEmail: inviter.realEmail,
    })
    .from(users)
    .leftJoin(inviter, eq(users.invitedById, inviter.id))
    .where(eq(users.id, authUser.id))
    .limit(1);

  return c.json({
    user: {
      id: authUser.id,
      email: row?.realEmail ?? authUser.email,
      name: authUser.name,
      role: authUser.role,
      hasPassword: !!credentialAccount,
      invitedBy: row?.invitedByName
        ? { name: row.invitedByName, email: row.invitedByEmail ?? "" }
        : null,
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

const updateMeSchema = z.object({
  name: z
    .string()
    .min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες")
    .optional(),
  email: z.email("Μη έγκυρο email").optional(),
});

// PATCH /me — edit the current user's name and/or real email.
auth.patch("/me", requireAuth, async (c) => {
  const authUser = c.get("user")!;
  const kava = c.get("kava");
  const body = await c.req.json();
  const parsed = updateMeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  if (!parsed.data.name && !parsed.data.email) {
    return c.json({ error: "Δεν δόθηκαν πεδία για ενημέρωση" }, 400);
  }

  const updateData: {
    name?: string;
    realEmail?: string;
    email?: string;
  } = {};

  if (parsed.data.name) {
    updateData.name = parsed.data.name;
  }

  if (parsed.data.email) {
    const newRealEmail = parsed.data.email;

    const [current] = await db
      .select({
        realEmail: users.realEmail,
        kavaId: users.kavaId,
      })
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1);

    if (!current) {
      return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
    }

    if (newRealEmail !== current.realEmail) {
      // Per-kava uniqueness check (superadmin has no kavaId; they use real
      // email as their auth identifier and the DB `email` column is globally
      // unique, so the DB catches collisions).
      if (current.kavaId) {
        const [collision] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.kavaId, current.kavaId),
              eq(users.realEmail, newRealEmail),
              ne(users.id, authUser.id),
            ),
          )
          .limit(1);
        if (collision) {
          return c.json(
            {
              error:
                "Αυτό το email χρησιμοποιείται ήδη σε αυτήν την κάβα",
            },
            409,
          );
        }
      }

      updateData.realEmail = newRealEmail;
      // Keep the synthesized auth identifier in sync with the real email so
      // magic-link / password-reset flows continue to route correctly.
      updateData.email = encodeAuthEmail(newRealEmail, kava?.slug ?? null);
    }
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ success: true });
  }

  try {
    await db.update(users).set(updateData).where(eq(users.id, authUser.id));
  } catch (err) {
    // Unique-index collision on the synthesized `email` column (e.g. another
    // kava already has this real email encoded identically) — surface a
    // friendly error rather than a 500.
    const message = err instanceof Error ? err.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return c.json(
        { error: "Αυτό το email χρησιμοποιείται ήδη" },
        409,
      );
    }
    throw err;
  }

  await logAudit(c, {
    action: "user.profile.update",
    targetType: "user",
    targetId: authUser.id,
    metadata: {
      fields: Object.keys(updateData),
    },
  });

  return c.json({ success: true });
});

export { auth as authRoutes };
