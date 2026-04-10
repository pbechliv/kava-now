import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  createCustomerSchema,
  updateCustomerSchema,
  assignProductsSchema,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import {
  customers,
  pricingTiers,
  products,
  customerProducts,
  orders,
  magicLinkTokens,
} from "../../db/schema/index";
import { sendMagicLink } from "../../services/email";
import { config } from "../../config";
import { resolvePrice } from "../../services/pricing";
import type { AppEnv } from "../../types";

const customersRouter = new Hono<AppEnv>();

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
      pricingTierId: customers.pricingTierId,
      notes: customers.notes,
      createdAt: customers.createdAt,
      pricingTierName: pricingTiers.name,
    })
    .from(customers)
    .leftJoin(pricingTiers, eq(customers.pricingTierId, pricingTiers.id))
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

      const link = `https://${kava.slug}.${config.baseDomain}/auth/verify?token=${token}`;
      await sendMagicLink(parsed.data.email, link, kava.name);
    } catch (err) {
      // Log but don't fail the customer creation
      console.error("[customers] Failed to send invitation email:", err);
    }
  }

  return c.json(customer, 201);
});

// GET /:id — single customer with tier info
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
      pricingTierId: customers.pricingTierId,
      notes: customers.notes,
      createdAt: customers.createdAt,
      pricingTierName: pricingTiers.name,
    })
    .from(customers)
    .leftJoin(pricingTiers, eq(customers.pricingTierId, pricingTiers.id))
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

// GET /:id/products — list all products with assignment info + resolved prices
customersRouter.get("/:id/products", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");

  // Get customer with tier discount
  const [customer] = await db
    .select({
      id: customers.id,
      pricingTierId: customers.pricingTierId,
      discountPct: pricingTiers.discountPct,
    })
    .from(customers)
    .leftJoin(pricingTiers, eq(customers.pricingTierId, pricingTiers.id))
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  // Get all active products for this kava
  const allProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.kavaId, kavaId), eq(products.active, true)))
    .orderBy(products.name);

  // Get assignments for this customer
  const assignments = await db
    .select()
    .from(customerProducts)
    .where(eq(customerProducts.customerId, id));

  const assignmentMap = new Map(
    assignments.map((a) => [a.productId, a]),
  );

  const result = allProducts.map((product) => {
    const assignment = assignmentMap.get(product.id);
    const assigned = !!assignment;
    const customPrice = assignment?.customPrice ?? null;
    const resolvedPriceValue = assigned
      ? resolvePrice(product.basePrice, customer.discountPct, customPrice)
      : resolvePrice(product.basePrice, customer.discountPct, null);

    return {
      product,
      assigned,
      customPrice: customPrice != null ? Number(customPrice) : null,
      resolvedPrice: resolvedPriceValue,
    };
  });

  return c.json(result);
});

// PUT /:id/products — bulk update product assignments
customersRouter.put("/:id/products", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = assignProductsSchema.safeParse(body);

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

  // Delete all existing assignments
  await db
    .delete(customerProducts)
    .where(eq(customerProducts.customerId, id));

  // Insert new ones
  if (parsed.data.assignments.length > 0) {
    await db.insert(customerProducts).values(
      parsed.data.assignments.map((a) => ({
        customerId: id,
        productId: a.productId,
        customPrice: a.customPrice != null ? String(a.customPrice) : null,
        active: a.active ?? true,
      })),
    );
  }

  return c.json({ message: "Τα προϊόντα ενημερώθηκαν" });
});

export { customersRouter };
