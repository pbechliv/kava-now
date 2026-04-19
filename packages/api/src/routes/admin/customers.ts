import { Hono } from "hono";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
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
  users,
  verifications,
} from "../../db/schema/index";
import { inviteUserToKava, InviteConflict } from "../../services/invite-user";
import { logAudit } from "../../services/audit";
import { auth } from "../../auth";
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

// POST / — create customer (also creates a customer-user when email is set)
customersRouter.post("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const inviter = c.get("user")!;
  const body = await c.req.json();
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [customer] = await db
    .insert(customers)
    .values({ ...parsed.data, kavaId })
    .returning();

  // If email provided, also create a linked customer-user + send the
  // welcome magic link. We don't fail the whole request if email already
  // belongs to another user in this kava — the customer row is still useful.
  let userInviteError: string | null = null;
  if (parsed.data.email) {
    try {
      await inviteUserToKava({
        c,
        kavaId,
        email: parsed.data.email,
        name: parsed.data.name,
        role: "customer",
        customerId: customer!.id,
        inviterId: inviter.id,
      });
    } catch (err) {
      if (err instanceof InviteConflict) {
        userInviteError = err.message;
      } else {
        console.error("[customers] Failed to send invitation email:", err);
      }
    }
  }

  return c.json({ ...customer, userInviteError }, 201);
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

// DELETE /:id — fail if customer has orders. Linked users cascade at DB level.
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

  // Capture linked user ids for the audit log before the cascade removes them.
  const linkedUsers = await db
    .select({ id: users.id, email: users.realEmail })
    .from(users)
    .where(and(eq(users.customerId, id), eq(users.kavaId, kavaId)));

  const [deleted] = await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  await logAudit(c, {
    action: "customer.delete",
    targetType: "customer",
    targetId: id,
    metadata: {
      name: deleted.name,
      deletedUsers: linkedUsers,
    },
  });

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

// GET /:id/users — list users linked to a customer
customersRouter.get("/:id/users", async (c) => {
  const kavaId = c.get("kavaId")!;
  const id = c.req.param("id");
  const inviterAlias = alias(users, "inviter");

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.realEmail,
      emailVerified: users.emailVerified,
      name: users.name,
      createdAt: users.createdAt,
      invitedByName: inviterAlias.name,
      invitedByEmail: inviterAlias.realEmail,
    })
    .from(users)
    .leftJoin(inviterAlias, eq(users.invitedById, inviterAlias.id))
    .where(and(eq(users.customerId, id), eq(users.kavaId, kavaId)))
    .orderBy(users.createdAt);

  return c.json({ users: rows });
});

// POST /:customerId/users/:userId/resend-invite — re-issue magic link
customersRouter.post("/:customerId/users/:userId/resend-invite", async (c) => {
  const kavaId = c.get("kavaId")!;
  const customerId = c.req.param("customerId");
  const userId = c.req.param("userId");

  const [target] = await db
    .select({
      id: users.id,
      authEmail: users.email,
      realEmail: users.realEmail,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.kavaId, kavaId),
        eq(users.customerId, customerId),
      ),
    )
    .limit(1);

  if (!target) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 404);
  }

  if (target.emailVerified) {
    return c.json({ error: "Ο χρήστης έχει ήδη ενεργοποιηθεί" }, 400);
  }

  await db
    .delete(verifications)
    .where(eq(verifications.identifier, target.authEmail));

  const requestHost =
    c.req.header("x-forwarded-host") || c.req.header("host") || "";
  const protocol = requestHost.includes("localhost") ? "http" : "https";
  const callbackURL = `${protocol}://${requestHost}/welcome`;

  await auth.api.signInMagicLink({
    body: { email: target.authEmail, callbackURL },
    headers: c.req.raw.headers,
  });

  await logAudit(c, {
    action: "customer.user.invite.resend",
    targetType: "user",
    targetId: userId,
    metadata: { email: target.realEmail, customerId },
  });

  return c.json({ success: true });
});

const inviteCustomerUserSchema = z.object({
  email: z.email("Μη έγκυρο email"),
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
});

// POST /:id/users/invite — add another user account to an existing customer
customersRouter.post("/:id/users/invite", async (c) => {
  const kavaId = c.get("kavaId")!;
  const inviter = c.get("user")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = inviteCustomerUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.kavaId, kavaId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  try {
    await inviteUserToKava({
      c,
      kavaId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: "customer",
      customerId: customer.id,
      inviterId: inviter.id,
    });
  } catch (err) {
    if (err instanceof InviteConflict) {
      return c.json({ error: err.message }, 409);
    }
    throw err;
  }

  return c.json({ success: true });
});

export { customersRouter };
