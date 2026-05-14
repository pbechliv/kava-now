import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/connection";
import { customers } from "../../db/schema/index";
import { logAudit } from "../../services/audit";
import type { AppEnv } from "../../types";

const profileRouter = new Hono<AppEnv>();

// GET / — return customer record for authenticated user
profileRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const customerId = user.customerId;

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);

  if (!customer) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  return c.json(customer);
});

const updateProfileSchema = z.object({
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

// PATCH / — customers may update their own phone and address. Name and email
// remain admin-controlled (they're tied to billing / invitation).
profileRouter.patch("/", async (c) => {
  const user = c.get("user")!;
  const customerId = user.customerId;

  if (!customerId) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμός πελάτη" }, 400);
  }

  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const updateData: { phone?: string | null; address?: string | null } = {};
  if (parsed.data.phone !== undefined) {
    updateData.phone = parsed.data.phone || null;
  }
  if (parsed.data.address !== undefined) {
    updateData.address = parsed.data.address || null;
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: "Δεν δόθηκαν πεδία για ενημέρωση" }, 400);
  }

  const [updated] = await db
    .update(customers)
    .set(updateData)
    .where(eq(customers.id, customerId))
    .returning();

  if (!updated) {
    return c.json({ error: "Ο πελάτης δεν βρέθηκε" }, 404);
  }

  await logAudit(c, {
    action: "customer.profile.update",
    targetType: "customer",
    targetId: customerId,
    metadata: { fields: Object.keys(updateData) },
  });

  return c.json(updated);
});

export { profileRouter };
