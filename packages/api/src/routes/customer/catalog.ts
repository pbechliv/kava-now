import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { paginationQuerySchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { products, categories, customers, customerBrandPricing } from "../../db/schema/index";
import { resolvePrice } from "../../services/pricing";
import type { AppEnv } from "../../types";

const catalogRouter = new Hono<AppEnv>();

// GET / — all active products with per-brand pricing for the authenticated customer
catalogRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const customerId = user.customerId;

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  // Verify customer exists
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  // Fetch customer's brand pricing
  const brandPricing = await db
    .select({
      brand: customerBrandPricing.brand,
      discountPct: customerBrandPricing.discountPct,
    })
    .from(customerBrandPricing)
    .where(eq(customerBrandPricing.customerId, customerId));

  const brandDiscountMap = new Map(brandPricing.map((bp) => [bp.brand, bp.discountPct]));

  const categoryId = c.req.query("categoryId");
  const search = c.req.query("search");

  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const conditions = [eq(products.active, true)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(products.name, pattern), ilike(products.brand, pattern))!);
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(whereClause);
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      description: products.description,
      imageUrl: products.imageUrl,
      unit: products.unit,
      volumeMl: products.volumeMl,
      alcoholPct: products.alcoholPct,
      categoryId: products.categoryId,
      categoryName: categories.name,
      basePrice: products.basePrice,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause)
    .orderBy(products.name, products.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    description: row.description,
    imageUrl: row.imageUrl,
    unit: row.unit,
    volumeMl: row.volumeMl,
    alcoholPct: row.alcoholPct,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    resolvedPrice: resolvePrice(row.basePrice, brandDiscountMap.get(row.brand) ?? null),
  }));

  return c.json({ data, total, page, pageSize });
});

export { catalogRouter };
