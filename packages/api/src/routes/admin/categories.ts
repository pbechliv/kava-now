import { validationError } from "../../validation";
import { Hono } from "hono";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  createCategorySchema,
  updateCategorySchema,
  adminCategoriesQuerySchema,
  type CategoryWithParentName,
  type PaginatedResponse,
  API_ERROR_CODES,
  type SuccessResponse,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { accentInsensitiveLike } from "../../db/search";
import { categories, products } from "../../db/schema/index";
import { isUniqueViolation, UNIQUE_CONSTRAINTS } from "../../db/errors";
import type { AppEnv } from "../../types";
import type { PreSerialize } from "../../serialize";
import { getTenantId } from "../../context";
import { alias } from "drizzle-orm/pg-core";

const categoriesRouter = new Hono<AppEnv>();

const parentCategory = alias(categories, "parentCategory");

const DUPLICATE_CATEGORY_NAME_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_CATEGORY_NAME,
  error: "Duplicate category name in this tenant",
} as const;

const INVALID_PARENT_RESPONSE = {
  code: API_ERROR_CODES.INVALID_CATEGORY_REFERENCE,
  error: "Parent category not found in this tenant",
} as const;

/** The FK alone can't scope to the tenant (FK checks bypass RLS). */
async function categoryExistsInTenant(tenantId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .limit(1);
  return !!row;
}

/** Walk up from newParentId — re-parenting under one's own descendant loops. */
async function createsParentCycle(
  tenantId: string,
  categoryId: string,
  newParentId: string,
): Promise<boolean> {
  let current: string | null = newParentId;
  for (let depth = 0; current && depth < 100; depth++) {
    if (current === categoryId) return true;
    const [row] = (await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(and(eq(categories.id, current), eq(categories.tenantId, tenantId)))
      .limit(1)) as Array<{ parentId: string | null }>;
    current = row?.parentId ?? null;
  }
  return false;
}

// GET / — paginated categories ordered by sortOrder, include parent info.
// Optional accent-insensitive `search` on the name backs the category picker
// combobox (server-side search, so no fetch-all list exists anywhere).
categoriesRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);

  const parsed = adminCategoriesQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }
  const { search, page, pageSize } = parsed.data;

  const conditions = [eq(categories.tenantId, tenantId)];
  if (search) {
    const match = accentInsensitiveLike(categories.name, search);
    if (match) conditions.push(match);
  }
  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(categories)
    .where(whereClause);
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      id: categories.id,
      tenantId: categories.tenantId,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      parentName: parentCategory.name,
    })
    .from(categories)
    .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
    .where(whereClause)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const body = {
    data: rows,
    total,
    page,
    pageSize,
  } satisfies PreSerialize<PaginatedResponse<CategoryWithParentName>>;
  return c.json(body);
});

// GET /:id — one category (with parent name). Lets the category picker resolve
// a selected id back to its label after a reload, without loading every row.
categoriesRouter.get("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");

  const [category] = await db
    .select({
      id: categories.id,
      tenantId: categories.tenantId,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      parentName: parentCategory.name,
    })
    .from(categories)
    .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .limit(1);

  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  const body = category satisfies PreSerialize<CategoryWithParentName>;
  return c.json(body);
});

// POST / — create category
categoriesRouter.post("/", async (c) => {
  const tenantId = getTenantId(c);
  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  if (parsed.data.parentId && !(await categoryExistsInTenant(tenantId, parsed.data.parentId))) {
    return c.json(INVALID_PARENT_RESPONSE, 400);
  }

  let category;
  try {
    [category] = await db
      .insert(categories)
      .values({
        ...parsed.data,
        tenantId,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.categoryName)) {
      return c.json(DUPLICATE_CATEGORY_NAME_RESPONSE, 409);
    }
    throw err;
  }

  return c.json(category, 201);
});

// PUT /:id — update category
categoriesRouter.put("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCategorySchema.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  if (parsed.data.parentId) {
    if (parsed.data.parentId === id) {
      return c.json(
        {
          code: API_ERROR_CODES.CATEGORY_PARENT_CYCLE,
          error: "A category cannot be its own parent",
        },
        400,
      );
    }
    if (!(await categoryExistsInTenant(tenantId, parsed.data.parentId))) {
      return c.json(INVALID_PARENT_RESPONSE, 400);
    }
    if (await createsParentCycle(tenantId, id, parsed.data.parentId)) {
      return c.json(
        {
          code: API_ERROR_CODES.CATEGORY_PARENT_CYCLE,
          error: "Parent change would create a cycle",
        },
        400,
      );
    }
  }

  let category;
  try {
    [category] = await db
      .update(categories)
      .set(parsed.data)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.categoryName)) {
      return c.json(DUPLICATE_CATEGORY_NAME_RESPONSE, 409);
    }
    throw err;
  }

  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json(category);
});

// DELETE /:id — fail if products reference it. Child categories re-root to
// top level via the parent_id FK's ON DELETE SET NULL.
categoriesRouter.delete("/:id", async (c) => {
  const tenantId = getTenantId(c);
  const id = c.req.param("id");

  // Check if products reference this category
  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.categoryId, id), eq(products.tenantId, tenantId)))
    .limit(1);

  if (ref && ref.count > 0) {
    return c.json(
      {
        code: API_ERROR_CODES.CATEGORY_HAS_PRODUCTS,
        error: `Cannot delete: ${ref.count} products use this category`,
      },
      400,
    );
  }

  const [deleted] = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json({ success: true } satisfies SuccessResponse);
});

export { categoriesRouter };
