import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/connection";
import { accounts } from "../db/schema/index";
import { auth as betterAuth } from "../auth";
import { requireAuth } from "../middleware/require-auth";
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

  return c.json({
    user: {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      hasPassword: !!credentialAccount,
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
