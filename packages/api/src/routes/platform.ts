import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { registerSchema, kavaSlugSchema } from "@kava-now/shared";
import { db } from "../db/connection";
import {
  kavas,
  users,
  categories,
  magicLinkTokens,
  products,
  seedProducts,
} from "../db/schema/index";
import { DEFAULT_CATEGORIES } from "../db/seed-categories";
import { hashPassword } from "../auth/password";
import { sendMagicLink } from "../services/email";
import { config } from "../config";
import type { AppEnv } from "../types";

const platform = new Hono<AppEnv>();

// GET /platform/kava-exists?slug=demo — check if a kava slug exists
platform.get("/kava-exists", async (c) => {
  const parsed = kavaSlugSchema.safeParse({ slug: c.req.query("slug") });
  if (!parsed.success) {
    return c.json({ exists: false });
  }

  const [found] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, parsed.data.slug))
    .limit(1);

  return c.json({ exists: !!found });
});

// POST /platform/register — register new kava
platform.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, slug, email } = parsed.data;
  const { password } = parsed.data;

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, slug))
    .limit(1);

  if (existing) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

  // Run all inserts in a transaction to prevent duplicates on double-submit
  const result = await db.transaction(async (tx) => {
    // Create kava
    const [kava] = await tx
      .insert(kavas)
      .values({ name, slug, email })
      .returning();

    if (!kava) throw new Error("Αποτυχία δημιουργίας κάβας");

    // Create owner user
    await tx.insert(users).values({
      email,
      name,
      role: "owner",
      kavaId: kava.id,
      passwordHash: password ? await hashPassword(password) : null,
    });

    // Seed default categories
    const insertedCategories = await tx
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((catName, index) => ({
          kavaId: kava.id,
          name: catName,
          sortOrder: index,
        })),
      )
      .returning({ id: categories.id, name: categories.name });

    // Build category name → id map
    const categoryMap = new Map(
      insertedCategories.map((c) => [c.name, c.id]),
    );

    // Import all seed products into the kava with default prices
    const allSeedProducts = await tx.select().from(seedProducts);

    if (allSeedProducts.length > 0) {
      await tx.insert(products).values(
        allSeedProducts.map((sp) => ({
          kavaId: kava.id,
          name: sp.name,
          brand: sp.brand,
          categoryId: categoryMap.get(sp.categoryName) ?? null,
          description: sp.description,
          imageUrl: sp.imageUrl,
          basePrice: "0.00",
          unit: sp.unit,
          volumeMl: sp.volumeMl,
          alcoholPct: sp.alcoholPct,
          active: true,
        })),
      );
    }

    if (!password) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await tx.insert(magicLinkTokens).values({
        email,
        token,
        kavaId: kava.id,
        expiresAt,
        purpose: "login",
      });

      const link = `${config.protocol}://${slug}.${config.baseDomain}/auth/verify?token=${token}`;
      await sendMagicLink(email, link, name);
    }

    return { slug, hasPassword: !!password };
  });

  return c.json({ success: true, ...result });
});

export { platform as platformRoutes };
