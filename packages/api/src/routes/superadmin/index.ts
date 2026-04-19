import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { registerSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import {
  kavas,
  users,
  categories,
  products,
  seedProducts,
} from "../../db/schema/index";
import { DEFAULT_CATEGORIES } from "../../db/seed-categories";
import { auth } from "../../auth";
import { requireAuth } from "../../middleware/require-auth";
import { requireSuperAdmin } from "../../middleware/require-superadmin";
import type { AppEnv } from "../../types";

const superadmin = new Hono<AppEnv>();

superadmin.use("*", requireAuth);
superadmin.use("*", requireSuperAdmin);

// GET /superadmin/kavas — list all tenants
superadmin.get("/kavas", async (c) => {
  const allKavas = await db
    .select({
      id: kavas.id,
      name: kavas.name,
      slug: kavas.slug,
      email: kavas.email,
      createdAt: kavas.createdAt,
    })
    .from(kavas)
    .orderBy(kavas.createdAt);

  return c.json({ kavas: allKavas });
});

// POST /superadmin/kavas — create kava + owner user
superadmin.post("/kavas", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, slug, email, password } = parsed.data;

  const [existingKava] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, slug))
    .limit(1);

  if (existingKava) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

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

  if (password) {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
  } else {
    await db.insert(users).values({
      email,
      name,
      role: "owner",
      kavaId: kava.id,
    });
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/admin/dashboard" },
      headers: c.req.raw.headers,
    });
  }

  await db
    .update(users)
    .set({ role: "owner", kavaId: kava.id })
    .where(eq(users.email, email));

  return c.json({ success: true, slug, hasPassword: !!password });
});

// DELETE /superadmin/kavas/:id — hard delete a tenant
superadmin.delete("/kavas/:id", async (c) => {
  const id = c.req.param("id");

  const [kava] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.id, id))
    .limit(1);

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 404);
  }

  await db.delete(kavas).where(eq(kavas.id, id));

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
