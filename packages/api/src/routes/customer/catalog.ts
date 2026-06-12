import { Hono } from "hono";
import { eq, and, ilike, or, sql, asc } from "drizzle-orm";
import { paginationQuerySchema, listFiltersQuerySchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { escapeLike } from "../../db/escape-like";
import { products, categories, customers, customerBrandPricing } from "../../db/schema/index";
import { requireCustomerProfile } from "../../middleware/require-customer-profile";
import { resolvePrice } from "../../services/pricing";
import type { AppEnv } from "../../types";

const catalogRouter = new Hono<AppEnv>();

// GET /categories — chips for the catalog filter: every category with at
// least one active product, independent of the product list's pagination,
// search, or selected-category filter (#58).
catalogRouter.get("/categories", async (c) => {
  const tenantId = c.get("tenantId")!;

  const rows = await db
    .selectDistinct({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .innerJoin(products, eq(products.categoryId, categories.id))
    .where(and(eq(categories.tenantId, tenantId), eq(products.active, true)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return c.json(rows);
});

// GET / — all active products with per-brand pricing for the authenticated
// customer. /categories above stays outside the profile guard — chips don't
// depend on a linked customer row.
catalogRouter.get("/", requireCustomerProfile, async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.get("customerId")!;

  // Verify customer exists. Explicit tenantId filters here (and below) are
  // defense-in-depth on top of RLS — don't rely on RLS as the only guard.
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  // Fetch customer's brand pricing
  const brandPricing = await db
    .select({
      brand: customerBrandPricing.brand,
      discountPct: customerBrandPricing.discountPct,
    })
    .from(customerBrandPricing)
    .where(
      and(
        eq(customerBrandPricing.customerId, customerId),
        eq(customerBrandPricing.tenantId, tenantId),
      ),
    );

  const brandDiscountMap = new Map(brandPricing.map((bp) => [bp.brand, bp.discountPct]));

  const filters = listFiltersQuerySchema.safeParse({ categoryId: c.req.query("categoryId") });
  if (!filters.success) {
    return c.json({ error: filters.error.flatten().fieldErrors }, 400);
  }
  const { categoryId } = filters.data;
  const search = c.req.query("search");

  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const conditions = [eq(products.tenantId, tenantId), eq(products.active, true)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
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
