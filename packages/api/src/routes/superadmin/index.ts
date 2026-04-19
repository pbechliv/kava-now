import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { registerSchema, encodeAuthEmail } from "@kava-now/shared";
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
import { logAudit } from "../../services/audit";
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

  const { name, slug, email: realEmail, password } = parsed.data;
  const authEmail = encodeAuthEmail(realEmail, slug);

  const [existingKava] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, slug))
    .limit(1);

  if (existingKava) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

  const kava = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(kavas)
      .values({ name, slug, email: realEmail })
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
      body: { email: authEmail, password, name, realEmail },
    });
  } else {
    await db.insert(users).values({
      email: authEmail,
      realEmail,
      name,
      role: "owner",
      kavaId: kava.id,
    });
    await auth.api.signInMagicLink({
      body: { email: authEmail, callbackURL: "/admin/dashboard" },
      headers: c.req.raw.headers,
    });
  }

  // Promote the just-created user to owner + link to kava (signUpEmail
  // defaults role to "customer" with no kavaId).
  await db
    .update(users)
    .set({ role: "owner", kavaId: kava.id })
    .where(and(eq(users.email, authEmail), eq(users.realEmail, realEmail)));

  await logAudit(c, {
    action: "superadmin.kava.create",
    targetType: "kava",
    targetId: kava.id,
    metadata: { name, slug, ownerEmail: realEmail, hasPassword: !!password },
  });

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

  const [full] = await db
    .select({ name: kavas.name, slug: kavas.slug })
    .from(kavas)
    .where(eq(kavas.id, id))
    .limit(1);

  await db.delete(kavas).where(eq(kavas.id, id));

  await logAudit(c, {
    action: "superadmin.kava.delete",
    targetType: "kava",
    targetId: id,
    metadata: { name: full?.name, slug: full?.slug },
  });

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
