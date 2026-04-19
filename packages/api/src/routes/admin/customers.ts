import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  createCustomerSchema,
  updateCustomerSchema,
  updateCustomerBrandPricingSchema,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import {
  customers,
  products,
  customerBrandPricing,
  orders,
  magicLinkTokens,
} from "../../db/schema/index";
import { sendMagicLink } from "../../services/email";
import { config } from "../../config";
import type { AppEnv } from "../../types";

const customersRouter = new Hono<AppEnv>();

// GET /brands — list distinct brands for this kava's products
customersRouter.get("/brands", async (c) => {
  const kavaId = c.get("kavaId")!;

  const brands = await db
    .selectDistinct({ brand: products.brand })
    .from(products)
    .where(and(eq(products.kavaId, kavaId), eq(products.active, true)))
    .orderBy(products.brand);

  return c.json(brands.map((b) => b.brand));
});

// GET / — list customers with optional ?search
customersRouter.get("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const search = c.req.query("search");

  const conditions = [eq(customers.kavaId, kavaId)];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(customers.name, pattern),
        ilike(customers.contactPerson, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      id: customers.id,
      kavaId: customers.kavaId,
      name: customers.name,
      email: customers.email,
      address: customers.address,
      phone: customers.phone,
      contactPerson: customers.contactPerson,
      notes: customers.notes,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(customers.name);

  return c.json(rows);
});

// POST / — create customer (optionally send invitation email)
customersRouter.post("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const kava = c.get("kava")!;
  const body = await c.req.json();
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [customer] = await db
    .insert(customers)
    .values({
      ...parsed.data,
      kavaId,
    })
    .returning();

  // If email is provided, send invitation magic link
  if (parsed.data.email) {
    try {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for invitation

      await db.insert(magicLinkTokens).values({
        email: parsed.data.email,
        token,
        kavaId,
        expiresAt,
      });

      const link = `${config.protocol}://${kava.slug}.${config.baseDomain}/auth/verify?token=${token}`;
      await sendMagicLink(parsed.data.email, link, kava.name);
    } catch (err) {
      // Log but don't fail the customer creation
      console.error("[customers] Failed to send invitation email:", err);
    }
  }

  return c.json(customer, 201);
});

// GET /:id — single customer
customersRouter.get("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  const [customer] = await db
    .select({
      id: customers.id,
      kavaId: customers.kavaId,
      name: customers.name,
      email: customers.email,
      address: customers.address,
      phone: customers.phone,
      contactPerson: customers.contactPerson,
      notes: customers.notes,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  return c.json(customer);
});

// PUT /:id — update customer
customersRouter.put("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [customer] = await db
    .update(customers)
    .set(parsed.data)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .returning();

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  return c.json(customer);
});

// DELETE /:id — fail if customer has orders
customersRouter.delete("/:id", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  // Check for existing orders
  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.customerId, id))
    .limit(1);

  if (ref && ref.count > 0) {
    return c.json(
      { error: "Δεν μπορείτε να διαγράψετε πελάτη με παραγγελίες" },
      400,
    );
  }

  const [deleted] = await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  return c.json({ message: "Ο πελάτης διαγράφηκε" });
});

// GET /:id/brand-pricing — list all brands with this customer's discounts
customersRouter.get("/:id/brand-pricing", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  // Verify customer exists
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  // Get all distinct brands for this kava
  const brands = await db
    .selectDistinct({ brand: products.brand })
    .from(products)
    .where(and(eq(products.kavaId, kavaId), eq(products.active, true)))
    .orderBy(products.brand);

  // Get existing brand pricing for this customer
  const pricing = await db
    .select()
    .from(customerBrandPricing)
    .where(eq(customerBrandPricing.customerId, id));

  const pricingMap = new Map(pricing.map((p) => [p.brand, p.discountPct]));

  const result = brands.map((b) => ({
    brand: b.brand,
    discountPct: pricingMap.has(b.brand) ? Number(pricingMap.get(b.brand)) : 0,
  }));

  return c.json(result);
});

// PUT /:id/brand-pricing — bulk update brand discounts for customer
customersRouter.put("/:id/brand-pricing", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCustomerBrandPricingSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  // Verify customer exists
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  // Delete all existing brand pricing for this customer
  await db
    .delete(customerBrandPricing)
    .where(eq(customerBrandPricing.customerId, id));

  // Insert new ones (only those with non-zero discount)
  const withDiscount = parsed.data.assignments.filter(
    (a) => a.discountPct > 0,
  );
  if (withDiscount.length > 0) {
    await db.insert(customerBrandPricing).values(
      withDiscount.map((a) => ({
        customerId: id,
        brand: a.brand,
        discountPct: String(a.discountPct),
      })),
    );
  }

  return c.json({ message: "Η τιμολόγηση ενημερώθηκε" });
});

export { customersRouter };
