import { Hono } from "hono";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  createCategorySchema,
  updateCategorySchema,
  API_ERROR_CODES,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { categories, products } from "../../db/schema/index";
import { isUniqueViolation, UNIQUE_CONSTRAINTS } from "../../db/errors";
import type { AppEnv } from "../../types";
import { alias } from "drizzle-orm/pg-core";

const categoriesRouter = new Hono<AppEnv>();

const parentCategory = alias(categories, "parentCategory");

const DUPLICATE_CATEGORY_NAME_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_CATEGORY_NAME,
  error: "Duplicate category name in this tenant",
} as const;

// GET / — list categories ordered by sortOrder, include parent info
categoriesRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;

  const rows = await db
    .select({
      id: categories.id,
      tenantId: categories.tenantId,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
      parentName: parentCategory.name,
    })
    .from(categories)
    .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return c.json(rows);
});

// POST / — create category
categoriesRouter.post("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
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
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
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

// DELETE /:id — fail if products reference it
categoriesRouter.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
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

  return c.json({ message: "Category deleted" });
});

export { categoriesRouter };
