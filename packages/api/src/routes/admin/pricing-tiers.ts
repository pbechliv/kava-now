import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import {
  createPricingTierSchema,
  updatePricingTierSchema,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { pricingTiers, customers } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const pricingTiersRouter = new Hono<AppEnv>();

// GET / — list all pricing tiers with customer count
pricingTiersRouter.get("/", async (c) => {
  const kavaId = c.get("kavaId")!;

  const rows = await db
    .select({
      id: pricingTiers.id,
      kavaId: pricingTiers.kavaId,
      name: pricingTiers.name,
      discountPct: pricingTiers.discountPct,
      createdAt: pricingTiers.createdAt,
      customerCount: sql<number>`count(${customers.id})::int`,
    })
    .from(pricingTiers)
    .leftJoin(customers, eq(customers.pricingTierId, pricingTiers.id))
    .where(eq(pricingTiers.kavaId, kavaId))
    .groupBy(pricingTiers.id)
    .orderBy(pricingTiers.name);

  return c.json(rows);
});

// POST / — create tier
pricingTiersRouter.post("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const body = await c.req.json();
  const parsed = createPricingTierSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [tier] = await db
    .insert(pricingTiers)
    .values({
      name: parsed.data.name,
      discountPct: String(parsed.data.discountPct),
      kavaId,
    })
    .returning();

  return c.json(tier, 201);
});

// PUT /:id — update tier
pricingTiersRouter.put("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updatePricingTierSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
  }
  if (parsed.data.discountPct !== undefined) {
    updates.discountPct = String(parsed.data.discountPct);
  }

  const [tier] = await db
    .update(pricingTiers)
    .set(updates)
    .where(and(eq(pricingTiers.id, id), eq(pricingTiers.kavaId, kavaId)))
    .returning();

  if (!tier) {
    return c.json({ error: "Ο τιμοκατάλογος δεν βρέθηκε" }, 404);
  }

  return c.json(tier);
});

// DELETE /:id — fail if customers reference this tier
pricingTiersRouter.delete("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.pricingTierId, id))
    .limit(1);

  if (ref && ref.count > 0) {
    return c.json(
      {
        error:
          "Δεν μπορείτε να διαγράψετε τιμοκατάλογο που χρησιμοποιείται από πελάτες",
      },
      400,
    );
  }

  const [deleted] = await db
    .delete(pricingTiers)
    .where(and(eq(pricingTiers.id, id), eq(pricingTiers.kavaId, kavaId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Ο τιμοκατάλογος δεν βρέθηκε" }, 404);
  }

  return c.json({ message: "Ο τιμοκατάλογος διαγράφηκε" });
});

export { pricingTiersRouter };
