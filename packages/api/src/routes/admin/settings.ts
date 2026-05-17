import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { updateTenantSettingsSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { tenants } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const settingsRouter = new Hono<AppEnv>();

// GET / — return current tenant record
settingsRouter.get("/", async (c) => {
  const tenant = c.get("tenant")!;
  return c.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    address: tenant.address,
    phone: tenant.phone,
    email: tenant.email,
    notificationEmails: tenant.notificationEmails,
    logoUrl: tenant.logoUrl,
  });
});

// PUT / — update tenant fields
settingsRouter.put("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = await c.req.json();
  const parsed = updateTenantSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [updated] = await db
    .update(tenants)
    .set(parsed.data)
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) {
    return c.json({ error: "Αποτυχία ενημέρωσης" }, 500);
  }

  return c.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    address: updated.address,
    phone: updated.phone,
    email: updated.email,
    notificationEmails: updated.notificationEmails,
    logoUrl: updated.logoUrl,
  });
});

export { settingsRouter };
