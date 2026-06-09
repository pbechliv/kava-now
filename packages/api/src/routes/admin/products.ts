import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import {
  createProductSchema,
  updateProductSchema,
  importProductsBatchSchema,
  paginationQuerySchema,
  listFiltersQuerySchema,
  type ImportProductsResult,
  API_ERROR_CODES,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { products, categories, orderItems } from "../../db/schema/index";
import {
  isUniqueViolation,
  isForeignKeyViolation,
  UNIQUE_CONSTRAINTS,
  FK_CONSTRAINTS,
} from "../../db/errors";
import type { AppEnv } from "../../types";

const DUPLICATE_ERP_REF_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_PRODUCT_ERP_REF,
  error: "Duplicate ERP reference for product in this tenant",
} as const;

const DUPLICATE_NAME_BRAND_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_PRODUCT_NAME_BRAND,
  error: "Duplicate product name and brand in this tenant",
} as const;

function handleProductUniqueViolation(err: unknown) {
  if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.productErpRef)) {
    return { body: DUPLICATE_ERP_REF_RESPONSE };
  }
  if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.productNameBrand)) {
    return { body: DUPLICATE_NAME_BRAND_RESPONSE };
  }
  return null;
}

const INVALID_CATEGORY_RESPONSE = {
  code: API_ERROR_CODES.INVALID_CATEGORY_REFERENCE,
  error: "Category not found in this tenant",
} as const;

// The plain FK can't scope to the tenant (FK checks bypass RLS) — without
// this, a tenant admin could attach another tenant's category.
async function categoryInTenant(tenantId: string, categoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .limit(1);
  return !!row;
}

const productsRouter = new Hono<AppEnv>();

// GET / — list products with optional filters
productsRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const filters = listFiltersQuerySchema.safeParse({ categoryId: c.req.query("categoryId") });
  if (!filters.success) {
    return c.json({ error: filters.error.flatten().fieldErrors }, 400);
  }
  const { categoryId } = filters.data;
  const search = c.req.query("search");
  const active = c.req.query("active");

  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const conditions = [eq(products.tenantId, tenantId)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(products.name, pattern), ilike(products.brand, pattern))!);
  }

  if (active === "true") {
    conditions.push(eq(products.active, true));
  } else if (active === "false") {
    conditions.push(eq(products.active, false));
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
      tenantId: products.tenantId,
      name: products.name,
      brand: products.brand,
      categoryId: products.categoryId,
      description: products.description,
      imageUrl: products.imageUrl,
      sku: products.sku,
      erpRef: products.erpRef,
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
    .where(whereClause)
    .orderBy(products.name, products.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({ data: rows, total, page, pageSize });
});

// POST /import — bulk upsert products from a normalized JSON batch.
// Client (ProductsImportPage) parses CSV/XLSX, maps columns, validates rows
// with importProductRowSchema, and posts the result here. On conflict
// (tenantId, name, brand) the existing row is updated.
productsRouter.post("/import", async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = await c.req.json();
  const parsed = importProductsBatchSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { rows } = parsed.data;

  const result = await db.transaction(async (tx) => {
    // Reconcile categories by name (case-insensitive match against existing).
    const existingCategories = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.tenantId, tenantId));

    const categoryMap = new Map<string, string>(
      existingCategories.map((cat) => [cat.name.toLowerCase(), cat.id]),
    );

    const uniqueCategoryNames = [
      ...new Set(
        rows.map((r) => r.categoryName?.trim()).filter((n): n is string => !!n && n.length > 0),
      ),
    ];

    let categoriesCreated = 0;
    for (const catName of uniqueCategoryNames) {
      if (!categoryMap.has(catName.toLowerCase())) {
        const [newCat] = await tx
          .insert(categories)
          .values({ name: catName, tenantId })
          .returning({ id: categories.id });
        categoryMap.set(catName.toLowerCase(), newCat!.id);
        categoriesCreated++;
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const categoryId = row.categoryName
        ? (categoryMap.get(row.categoryName.toLowerCase()) ?? null)
        : null;

      const values = {
        tenantId,
        name: row.name,
        brand: row.brand,
        categoryId,
        description: row.description ?? null,
        sku: row.sku ?? null,
        erpRef: row.erpRef ?? null,
        basePrice: String(row.basePrice),
        unit: row.unit ?? "bottle",
        volumeMl: row.volumeMl ?? null,
        alcoholPct: row.alcoholPct != null ? String(row.alcoholPct) : null,
        imageUrl: row.imageUrl ?? null,
        active: row.active ?? true,
      };

      const [res] = await tx
        .insert(products)
        .values(values)
        .onConflictDoUpdate({
          target: [products.tenantId, products.name, products.brand],
          set: {
            categoryId: values.categoryId,
            description: values.description,
            sku: values.sku,
            erpRef: values.erpRef,
            basePrice: values.basePrice,
            unit: values.unit,
            volumeMl: values.volumeMl,
            alcoholPct: values.alcoholPct,
            imageUrl: values.imageUrl,
            active: values.active,
          },
        })
        .returning({
          id: products.id,
          wasInserted: sql<boolean>`(xmax = 0)`,
        });

      if (res?.wasInserted) {
        inserted++;
      } else {
        updated++;
      }
    }

    return {
      inserted,
      updated,
      categoriesCreated,
      total: rows.length,
    } satisfies ImportProductsResult;
  });

  return c.json(result);
});

// POST / — create product
productsRouter.post("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  if (parsed.data.categoryId && !(await categoryInTenant(tenantId, parsed.data.categoryId))) {
    return c.json(INVALID_CATEGORY_RESPONSE, 400);
  }

  let product;
  try {
    [product] = await db
      .insert(products)
      .values({
        ...parsed.data,
        basePrice: String(parsed.data.basePrice),
        alcoholPct: parsed.data.alcoholPct != null ? String(parsed.data.alcoholPct) : null,
        tenantId,
      })
      .returning();
  } catch (err) {
    const handled = handleProductUniqueViolation(err);
    if (handled) return c.json(handled.body, 409);
    throw err;
  }

  return c.json(product, 201);
});

// GET /:id — single product
productsRouter.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");

  const [product] = await db
    .select({
      id: products.id,
      tenantId: products.tenantId,
      name: products.name,
      brand: products.brand,
      categoryId: products.categoryId,
      description: products.description,
      imageUrl: products.imageUrl,
      sku: products.sku,
      erpRef: products.erpRef,
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
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json(product);
});

// PUT /:id — update product
productsRouter.put("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  if (parsed.data.categoryId && !(await categoryInTenant(tenantId, parsed.data.categoryId))) {
    return c.json(INVALID_CATEGORY_RESPONSE, 400);
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

  let product;
  try {
    [product] = await db
      .update(products)
      .set(updates)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();
  } catch (err) {
    const handled = handleProductUniqueViolation(err);
    if (handled) return c.json(handled.body, 409);
    throw err;
  }

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json(product);
});

// DELETE /:id — soft-delete if referenced, hard-delete otherwise
productsRouter.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");

  // Soft-delete: set active = false
  const deactivate = async () => {
    const [product] = await db
      .update(products)
      .set({ active: false })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    return c.json({ message: "Product deactivated", product });
  };

  // Check if product has order items (friendly path; the no-action FK is the
  // race-safe backstop below)
  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);

  if (ref && ref.count > 0) {
    return deactivate();
  }

  try {
    // Savepoint: an FK violation must not abort the request transaction. The
    // FK is INITIALLY DEFERRED (so tenant-purge cascades pass) — force the
    // check to fire now, where it's catchable, instead of at COMMIT.
    const [deleted] = await db.transaction(async (tx) => {
      await tx.execute(sql`set constraints "order_items_product_id_products_id_fk" immediate`);
      return tx
        .delete(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .returning();
    });

    if (!deleted) {
      return c.json({ error: "Product not found" }, 404);
    }

    return c.json({ message: "Product deleted" });
  } catch (err) {
    if (isForeignKeyViolation(err, FK_CONSTRAINTS.orderItemProduct)) {
      // Lost the race: an order item appeared since the check — soft-delete.
      return deactivate();
    }
    throw err;
  }
});

export { productsRouter };
