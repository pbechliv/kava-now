import { validationError } from "../../validation";
import { Hono } from "hono";
import { eq, and, or, sql, asc } from "drizzle-orm";
import {
  adminCatalogQuerySchema,
  type CatalogProduct,
  type CatalogCategoryChip,
  type PaginatedResponse,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { accentInsensitiveLike } from "../../db/search";
import { products, categories, customers, customerBrandPricing } from "../../db/schema/index";
import { resolvePrice } from "../../services/pricing";
import type { AppEnv } from "../../types";
import { getTenantId } from "../../context";

// Staff-facing catalog for the create-order flow (#159). Mirrors the customer
// catalog (routes/customer/catalog.ts) but resolves prices against an explicit
// `customerId` from the query rather than the caller's own customer profile —
// staff have none. Read-only; the actual order create re-resolves prices
// server-side, so these prices are for display only.
const catalogRouter = new Hono<AppEnv>();

// GET /categories — chips for the catalog filter: every category with at least
// one active product. Customer-independent (same as the customer catalog).
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

// GET /?customerId=…&search=…&categoryId=…&page=… — active products with the
// per-brand price the given customer would pay.
catalogRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);

  const parsed = adminCatalogQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }
  const { customerId, categoryId, search, page, pageSize } = parsed.data;

  // The customer must belong to this tenant — explicit filter on top of RLS.
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

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

export { catalogRouter as adminCatalogRouter };
