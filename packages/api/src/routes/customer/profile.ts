import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { API_ERROR_CODES } from "@kava-now/shared";
import { db } from "../../db/connection";
import { customers } from "../../db/schema/index";
import { requireCustomerProfile } from "../../middleware/require-customer-profile";
import type { AppEnv } from "../../types";

const profileRouter = new Hono<AppEnv>();

profileRouter.use("*", requireCustomerProfile);

// Explicit columns: the full row carries internal admin notes, billing/ERP
// fields, and tenantId — none of the customer's business.
const PROFILE_COLUMNS = {
  id: customers.id,
  name: customers.name,
  email: customers.email,
  address: customers.address,
  phone: customers.phone,
  contactPerson: customers.contactPerson,
};

// GET / — return customer record for authenticated user
profileRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.get("customerId")!;

  // Explicit tenantId filter as defense-in-depth on top of RLS.
  const [customer] = await db
    .select(PROFILE_COLUMNS)
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
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
  const tenantId = c.get("tenantId")!;
  const customerId = c.get("customerId")!;

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
    return c.json(
      { code: API_ERROR_CODES.NO_UPDATE_FIELDS, error: "No fields provided to update" },
      400,
    );
  }

  const [updated] = await db
    .update(customers)
    .set(updateData)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .returning(PROFILE_COLUMNS);

  if (!updated) {
    return c.json({ error: "Customer not found" }, 404);
  }

  return c.json(updated);
});

export { profileRouter };
