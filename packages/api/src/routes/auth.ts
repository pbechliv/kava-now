import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { accounts } from "../db/schema/index";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

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
