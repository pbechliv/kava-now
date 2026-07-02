import { validationError } from "../../validation";
import { Hono } from "hono";
import { eq, and, or, sql, desc } from "drizzle-orm";
import {
  createProductSchema,
  updateProductSchema,
  importProductsBatchSchema,
  saveImportMappingSchema,
  adminProductsQuerySchema,
  type ImportProductsResult,
  type ImportMappingTemplate,
  type ProductImportHistoryEntry,
  type ProductWithCategoryName,
  type ProductNameBrandKey,
  type PaginatedResponse,
  API_ERROR_CODES,
  type DeleteProductResponse,
  type SuccessResponse,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { accentInsensitiveLike } from "../../db/search";
import {
  products,
  categories,
  orderItems,
  productImports,
  productImportMappings,
  users,
} from "../../db/schema/index";
import {
  isUniqueViolation,
  isForeignKeyViolation,
  UNIQUE_CONSTRAINTS,
  FK_CONSTRAINTS,
} from "../../db/errors";
import { executeProductImport, ProductErpConflictError } from "../../services/import-products";
import type { AppEnv } from "../../types";
import type { PreSerialize } from "../../serialize";
import { getTenantId, getUser } from "../../context";

/** Cap the import history list — recent activity, not an unbounded export. */
const IMPORT_HISTORY_LIMIT = 20;

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
  const tenantId = getTenantId(c);

  const parsed = adminProductsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }
  const { categoryId, search, active, page, pageSize } = parsed.data;

  const conditions = [eq(products.tenantId, tenantId)];

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
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause)
    .orderBy(products.name, products.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const body = {
    data: rows,
    total,
    page,
    pageSize,
  } satisfies PreSerialize<PaginatedResponse<ProductWithCategoryName>>;
  return c.json(body);
});

// GET /keys — every (name, brand) pair in this tenant. Feeds the import
// preview's new-vs-update badges, which a paginated list cannot (#61).
productsRouter.get("/keys", async (c) => {
  const tenantId = getTenantId(c);
  const rows: ProductNameBrandKey[] = await db
    .select({ name: products.name, brand: products.brand })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  return c.json(rows);
});

// POST /import — bulk upsert products from a normalized JSON batch.
// Client (ProductsImportPage) parses CSV/XLSX, maps columns, validates rows
// with importProductRowSchema, and posts the result here. On conflict
// (tenantId, name, brand) the existing row is updated. The core upsert lives in
// the import-products service so the preview can run it as a dry-run.
//   - dryRun=true  → run + roll back, returning server-truth counts/conflict.
//   - dryRun=false → commit, then record the outcome in the import history.
productsRouter.post("/import", async (c) => {
  const tenantId = getTenantId(c);
  const body = await c.req.json();
  const parsed = importProductsBatchSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { rows, dryRun, sourceFilename } = parsed.data;

  let execution;
  try {
    execution = await executeProductImport({ tenantId, rows, dryRun });
  } catch (err) {
    if (err instanceof ProductErpConflictError) {
      return c.json(
        {
          code: API_ERROR_CODES.DUPLICATE_PRODUCT_ERP_REF,
          error: `Duplicate ERP reference "${err.conflict.erpRef ?? ""}" (row ${err.conflict.rowIndex + 1}) — nothing was imported`,
          rowIndex: err.conflict.rowIndex,
        },
        409,
      );
    }
    throw err;
  }

  // Record committed imports for the audit log. Non-fatal: the import already
  // succeeded, so a logging failure must not turn it into an error response.
  if (!dryRun) {
    try {
      await db.insert(productImports).values({
        tenantId,
        createdById: getUser(c).id,
        sourceFilename: sourceFilename ?? null,
        total: execution.total,
        inserted: execution.inserted,
        updated: execution.updated,
        categoriesCreated: execution.categoriesCreated,
        duplicatesInFile: execution.duplicatesInFile,
      });
    } catch (err) {
      console.error("Failed to record product import history:", err);
    }
  }

  const result: ImportProductsResult = { ...execution, dryRun };
  return c.json(result);
});

// GET /import/history — recent committed imports (audit log) for this tenant.
// Registered before /:id so "import" is never captured as a product id.
productsRouter.get("/import/history", async (c) => {
  const tenantId = getTenantId(c);
  const rows = await db
    .select({
      id: productImports.id,
      sourceFilename: productImports.sourceFilename,
      total: productImports.total,
      inserted: productImports.inserted,
      updated: productImports.updated,
      categoriesCreated: productImports.categoriesCreated,
      duplicatesInFile: productImports.duplicatesInFile,
      createdAt: productImports.createdAt,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(productImports)
    .leftJoin(users, eq(productImports.createdById, users.id))
    .where(eq(productImports.tenantId, tenantId))
    .orderBy(desc(productImports.createdAt))
    .limit(IMPORT_HISTORY_LIMIT);
  return c.json(rows satisfies PreSerialize<ProductImportHistoryEntry>[]);
});

// GET /import/mappings — saved column-mapping templates for this tenant.
productsRouter.get("/import/mappings", async (c) => {
  const tenantId = getTenantId(c);
  const rows = await db
    .select({
      id: productImportMappings.id,
      name: productImportMappings.name,
      mapping: productImportMappings.mapping,
      createdAt: productImportMappings.createdAt,
      updatedAt: productImportMappings.updatedAt,
    })
    .from(productImportMappings)
    .where(eq(productImportMappings.tenantId, tenantId))
    .orderBy(productImportMappings.name);
  return c.json(rows satisfies PreSerialize<ImportMappingTemplate>[]);
});

// POST /import/mappings — save (create or overwrite by name) a mapping template.
productsRouter.post("/import/mappings", async (c) => {
  const tenantId = getTenantId(c);
  const body = await c.req.json();
  const parsed = saveImportMappingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const { name, mapping } = parsed.data;
  const returning = {
    id: productImportMappings.id,
    name: productImportMappings.name,
    mapping: productImportMappings.mapping,
    createdAt: productImportMappings.createdAt,
    updatedAt: productImportMappings.updatedAt,
  };
  // Save = upsert by case-insensitive name. The unique index is on an
  // expression (lower(name)), which Drizzle can't target via onConflict, so
  // update-first, then insert when nothing matched.
  const matchByName = and(
    eq(productImportMappings.tenantId, tenantId),
    sql`lower(${productImportMappings.name}) = lower(${name})`,
  );

  const [updated] = await db
    .update(productImportMappings)
    .set({ name, mapping })
    .where(matchByName)
    .returning(returning);
  if (updated) {
    return c.json(updated satisfies PreSerialize<ImportMappingTemplate>);
  }

  try {
    const [created] = await db
      .insert(productImportMappings)
      .values({ tenantId, name, mapping, createdById: getUser(c).id })
      .returning(returning);
    if (!created) return c.json({ error: "Failed to save mapping" }, 500);
    return c.json(created satisfies PreSerialize<ImportMappingTemplate>, 201);
  } catch (err) {
    // Lost a race with a concurrent save of the same name — update the winner.
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.productImportMappingName)) {
      const [raced] = await db
        .update(productImportMappings)
        .set({ name, mapping })
        .where(matchByName)
        .returning(returning);
      // The winner was deleted between our failed insert and this update.
      if (!raced) return c.json({ error: "Mapping not found" }, 404);
      return c.json(raced satisfies PreSerialize<ImportMappingTemplate>);
    }
    throw err;
  }
});

// DELETE /import/mappings/:id — remove a saved mapping template.
productsRouter.delete("/import/mappings/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(productImportMappings)
    .where(and(eq(productImportMappings.id, id), eq(productImportMappings.tenantId, tenantId)))
    .returning({ id: productImportMappings.id });
  if (!deleted) return c.json({ error: "Mapping not found" }, 404);
  return c.json({ success: true } satisfies SuccessResponse);
});

// POST / — create product
productsRouter.post("/", async (c) => {
  const tenantId = getTenantId(c);
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
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
  const tenantId = getTenantId(c);
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
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const body = product satisfies PreSerialize<ProductWithCategoryName>;
  return c.json(body);
});

// PUT /:id — update product
productsRouter.put("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateProductSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
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
  const tenantId = getTenantId(c);
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

    return c.json({ success: true, product } satisfies PreSerialize<DeleteProductResponse>);
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
      await tx.execute(
        sql`set constraints ${sql.identifier(FK_CONSTRAINTS.orderItemProduct)} immediate`,
      );
      return tx
        .delete(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .returning();
    });

    if (!deleted) {
      return c.json({ error: "Product not found" }, 404);
    }

    return c.json({ success: true } satisfies SuccessResponse);
  } catch (err) {
    if (isForeignKeyViolation(err, FK_CONSTRAINTS.orderItemProduct)) {
      // Lost the race: an order item appeared since the check — soft-delete.
      return deactivate();
    }
    throw err;
  }
});

export { productsRouter };
