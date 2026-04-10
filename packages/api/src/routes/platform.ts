import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { registerSchema } from "@kava-now/shared";
import { db } from "../db/connection";
import { kavas, users, categories, magicLinkTokens } from "../db/schema/index";
import { DEFAULT_CATEGORIES } from "../db/seed-categories";
import { sendMagicLink } from "../services/email";
import { config } from "../config";
import type { AppEnv } from "../types";

const platform = new Hono<AppEnv>();

// POST /platform/register — register new kava
platform.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, slug, email } = parsed.data;

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, slug))
    .limit(1);

  if (existing) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

  // Create kava
  const [kava] = await db
    .insert(kavas)
    .values({
      name,
      slug,
      email,
    })
    .returning();

  if (!kava) {
    return c.json({ error: "Αποτυχία δημιουργίας κάβας" }, 500);
  }

  // Create owner user
  const [owner] = await db
    .insert(users)
    .values({
      email,
      name,
      role: "owner",
      kavaId: kava.id,
    })
    .returning();

  if (!owner) {
    return c.json({ error: "Αποτυχία δημιουργίας χρήστη" }, 500);
  }

  // Seed default categories
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((catName, index) => ({
      kavaId: kava.id,
      name: catName,
      sortOrder: index,
    })),
  );

  // Create magic link token for email verification
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: kava.id,
    expiresAt,
  });

  const link = `https://${slug}.${config.baseDomain}/auth/verify?token=${token}`;
  await sendMagicLink(email, link, name);

  return c.json({ success: true, slug });
});

export { platform as platformRoutes };
