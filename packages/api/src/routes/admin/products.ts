import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { createProductSchema, updateProductSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { products, categories, orderItems } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const productsRouter = new Hono<AppEnv>();

// GET / — list products with optional filters
productsRouter.get("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const categoryId = c.req.query("categoryId");
  const search = c.req.query("search");
  const active = c.req.query("active");

  const conditions = [eq(products.kavaId, kavaId)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(ilike(products.name, pattern), ilike(products.brand, pattern))!,
    );
  }

  if (active === "true") {
    conditions.push(eq(products.active, true));
  } else if (active === "false") {
    conditions.push(eq(products.active, false));
  }

  const rows = await db
    .select({
      id: products.id,
      kavaId: products.kavaId,
      name: products.name,
      brand: products.brand,
      categoryId: products.categoryId,
      description: products.description,
      imageUrl: products.imageUrl,
      sku: products.sku,
      basePrice: products.basePrice,
      unit: products.unit,
      volumeMl: products.volumeMl,
      alcoholPct: products.alcoholPct,
      active: products.active,
      createdAt: products.createdAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(products.name);

  return c.json(rows);
});

// POST / — create product
productsRouter.post("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [product] = await db
    .insert(products)
    .values({
      ...parsed.data,
      basePrice: String(parsed.data.basePrice),
      alcoholPct: parsed.data.alcoholPct != null ? String(parsed.data.alcoholPct) : null,
      kavaId,
    })
    .returning();

  return c.json(product, 201);
});

// GET /:id — single product
productsRouter.get("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  const [product] = await db
    .select({
      id: products.id,
      kavaId: products.kavaId,
      name: products.name,
      brand: products.brand,
      categoryId: products.categoryId,
      description: products.description,
      imageUrl: products.imageUrl,
      sku: products.sku,
      basePrice: products.basePrice,
      unit: products.unit,
      volumeMl: products.volumeMl,
      alcoholPct: products.alcoholPct,
      active: products.active,
      createdAt: products.createdAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, id), eq(products.kavaId, kavaId)))
    .limit(1);

  if (!product) {
    return c.json({ error: "Το προϊόν δεν βρέθηκε" }, 404);
  }

  return c.json(product);
});

// PUT /:id — update product
productsRouter.put("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  // Build the update values, converting numbers to strings for numeric columns
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.basePrice != null) {
    updates.basePrice = String(parsed.data.basePrice);
  }
  if (parsed.data.alcoholPct != null) {
    updates.alcoholPct = String(parsed.data.alcoholPct);
  } else if (parsed.data.alcoholPct === null) {
    updates.alcoholPct = null;
  }

  const [product] = await db
    .update(products)
    .set(updates)
    .where(and(eq(products.id, id), eq(products.kavaId, kavaId)))
    .returning();

  if (!product) {
    return c.json({ error: "Το προϊόν δεν βρέθηκε" }, 404);
  }

  return c.json(product);
});

// DELETE /:id — soft-delete if referenced, hard-delete otherwise
productsRouter.delete("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  // Check if product has order items
  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);

  if (ref && ref.count > 0) {
    // Soft-delete: set active = false
    const [product] = await db
      .update(products)
      .set({ active: false })
      .where(and(eq(products.id, id), eq(products.kavaId, kavaId)))
      .returning();

    if (!product) {
      return c.json({ error: "Το προϊόν δεν βρέθηκε" }, 404);
    }

    return c.json({ message: "Το προϊόν απενεργοποιήθηκε", product });
  }

  // Hard delete
  const [deleted] = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.kavaId, kavaId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Το προϊόν δεν βρέθηκε" }, 404);
  }

  return c.json({ message: "Το προϊόν διαγράφηκε" });
});

export { productsRouter };
