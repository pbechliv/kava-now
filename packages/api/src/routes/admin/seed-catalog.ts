import { Hono } from "hono";
import { ilike, or, eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/connection";
import { seedProducts, products, categories } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const seedCatalogRouter = new Hono<AppEnv>();

// GET / — list all seed_products (platform-wide, no RLS)
seedCatalogRouter.get("/", async (c) => {
  const search = c.req.query("search");

  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(ilike(seedProducts.name, pattern), ilike(seedProducts.brand, pattern))!,
    );
  }

  const rows = await db
    .select()
    .from(seedProducts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(seedProducts.name);

  return c.json(rows);
});

const importSchema = z.object({
  seedProductIds: z.array(z.string().uuid()).min(1, "Επιλέξτε τουλάχιστον ένα προϊόν"),
});

// POST /import — clone seed products into kava's products
seedCatalogRouter.post("/import", async (c) => {
  const kavaId = c.get("kavaId")!;
  const body = await c.req.json();
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { seedProductIds } = parsed.data;

  // Fetch the selected seed products
  const seeds = await db
    .select()
    .from(seedProducts)
    .where(inArray(seedProducts.id, seedProductIds));

  if (seeds.length === 0) {
    return c.json({ error: "Δεν βρέθηκαν προϊόντα καταλόγου" }, 404);
  }

  // Get existing categories for this kava
  const existingCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.kavaId, kavaId));

  const categoryMap = new Map(existingCategories.map((cat) => [cat.name, cat.id]));

  // For each unique categoryName, create category if it doesn't exist
  const uniqueCategoryNames = [...new Set(seeds.map((s) => s.categoryName))];

  for (const catName of uniqueCategoryNames) {
    if (!categoryMap.has(catName)) {
      const [newCat] = await db
        .insert(categories)
        .values({ name: catName, kavaId })
        .returning();
      categoryMap.set(catName, newCat!.id);
    }
  }

  // Insert products
  const productValues = seeds.map((seed) => ({
    kavaId,
    name: seed.name,
    brand: seed.brand ?? seed.name,
    categoryId: categoryMap.get(seed.categoryName) ?? null,
    description: seed.description,
    imageUrl: seed.imageUrl,
    volumeMl: seed.volumeMl,
    alcoholPct: seed.alcoholPct,
    unit: seed.unit,
    basePrice: "0",
    sku: null,
  }));

  await db.insert(products).values(productValues);

  return c.json({ imported: seeds.length });
});

export { seedCatalogRouter };
