import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { registerSchema, kavaSlugSchema } from "@kava-now/shared";
import { db } from "../db/connection";
import {
  kavas,
  users,
  categories,
  products,
  seedProducts,
} from "../db/schema/index";
import { DEFAULT_CATEGORIES } from "../db/seed-categories";
import { auth } from "../auth";
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

  const { name, slug, email, password } = parsed.data;

  // Check slug uniqueness
  const [existingKava] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, slug))
    .limit(1);

  if (existingKava) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

  // Email must be globally unique (better-auth requirement)
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return c.json(
      { error: "Αυτό το email χρησιμοποιείται ήδη σε άλλη κάβα" },
      409,
    );
  }

  // Create kava + categories + products in a transaction
  const kava = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(kavas)
      .values({ name, slug, email })
      .returning();

    if (!created) throw new Error("Αποτυχία δημιουργίας κάβας");

    const insertedCategories = await tx
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((catName, index) => ({
          kavaId: created.id,
          name: catName,
          sortOrder: index,
        })),
      )
      .returning({ id: categories.id, name: categories.name });

    const categoryMap = new Map(
      insertedCategories.map((cat) => [cat.name, cat.id]),
    );

    const allSeedProducts = await tx.select().from(seedProducts);

    if (allSeedProducts.length > 0) {
      await tx.insert(products).values(
        allSeedProducts.map((sp) => ({
          kavaId: created.id,
          name: sp.name,
          brand: sp.brand ?? sp.name,
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

    return created;
  });

  // Create the owner user via better-auth, then promote role + kavaId.
  if (password) {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
  } else {
    // Passwordless: create user row directly, then send magic link
    await db.insert(users).values({
      email,
      name,
      role: "owner",
      kavaId: kava.id,
    });

    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: `/admin/dashboard`,
      },
      headers: c.req.raw.headers,
    });
  }

  // Promote the just-created user to owner + link to kava
  await db
    .update(users)
    .set({ role: "owner", kavaId: kava.id })
    .where(eq(users.email, email));

  return c.json({ success: true, slug, hasPassword: !!password });
});

export { platform as platformRoutes };
