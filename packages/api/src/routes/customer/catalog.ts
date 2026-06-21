import { Hono } from "hono";
import { eq, and, or, sql, asc, inArray } from "drizzle-orm";
import {
  catalogQuerySchema,
  resolveCatalogPricesSchema,
  type CatalogProduct,
  type CatalogCategoryChip,
  type CatalogPriceResolution,
  type PaginatedResponse,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { accentInsensitiveLike } from "../../db/search";
import { products, categories, customers, customerBrandPricing } from "../../db/schema/index";
import { requireCustomerProfile } from "../../middleware/require-customer-profile";
import { resolvePrice } from "../../services/pricing";
import type { AppEnv } from "../../types";
import { getCustomerId, getTenantId } from "../../context";

const catalogRouter = new Hono<AppEnv>();

// GET /categories — chips for the catalog filter: every category with at
// least one active product, independent of the product list's pagination,
// search, or selected-category filter (#58).
catalogRouter.get("/categories", async (c) => {
  const tenantId = getTenantId(c);

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

  const body: CatalogCategoryChip[] = rows;
  return c.json(body);
});

// GET / — all active products with per-brand pricing for the authenticated
// customer. /categories above stays outside the profile guard — chips don't
// depend on a linked customer row.
catalogRouter.get("/", requireCustomerProfile, async (c) => {
  const tenantId = getTenantId(c);
  const customerId = getCustomerId(c);

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

  const parsed = catalogQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { categoryId, search, page, pageSize } = parsed.data;

  const conditions = [eq(products.tenantId, tenantId), eq(products.active, true)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (search) {
    const match = or(
      accentInsensitiveLike(products.name, search),
      accentInsensitiveLike(products.brand, search),
    );
    if (match) conditions.push(match);
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

  const data: CatalogProduct[] = rows.map((row) => ({
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

  const body: PaginatedResponse<CatalogProduct> = { data, total, page, pageSize };
  return c.json(body);
});

// POST /resolve — current price + availability for a set of product ids. The
// cart persists per-customer resolved prices in localStorage; this lets it
// reconcile against server truth before checkout (prices change, products get
// deactivated) instead of confirming a total the server won't honor.
catalogRouter.post("/resolve", requireCustomerProfile, async (c) => {
  const tenantId = getTenantId(c);
  const customerId = getCustomerId(c);

  const body = await c.req.json();
  const parsed = resolveCatalogPricesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { productIds } = parsed.data;

  const brandPricing = await db
    .select({ brand: customerBrandPricing.brand, discountPct: customerBrandPricing.discountPct })
    .from(customerBrandPricing)
    .where(
      and(
        eq(customerBrandPricing.customerId, customerId),
        eq(customerBrandPricing.tenantId, tenantId),
      ),
    );
  const brandDiscountMap = new Map(brandPricing.map((bp) => [bp.brand, bp.discountPct]));

  const rows = await db
    .select({
      id: products.id,
      brand: products.brand,
      basePrice: products.basePrice,
      active: products.active,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));
  const found = new Map(rows.map((r) => [r.id, r]));

  // One entry per requested id, preserving order. Missing or inactive → unavailable.
  const result: CatalogPriceResolution[] = productIds.map((id) => {
    const product = found.get(id);
    if (!product || !product.active) return { id, available: false, resolvedPrice: null };
    return {
      id,
      available: true,
      resolvedPrice: resolvePrice(product.basePrice, brandDiscountMap.get(product.brand) ?? null),
    };
  });
  return c.json(result);
});

export { catalogRouter };
