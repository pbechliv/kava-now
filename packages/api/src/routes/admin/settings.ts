import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { updateTenantSettingsSchema, updateNotificationPreferenceSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { tenants, tenantMemberships } from "../../db/schema/index";
import type { AppEnv } from "../../types";
import { getTenant, getTenantId } from "../../context";

const settingsRouter = new Hono<AppEnv>();

// GET / — return current tenant record
settingsRouter.get("/", async (c) => {
  const tenant = getTenant(c);
  return c.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    address: tenant.address,
    phone: tenant.phone,
    email: tenant.email,
    logoUrl: tenant.logoUrl,
  });
});

// PUT / — update tenant fields
settingsRouter.put("/", async (c) => {
  const tenantId = getTenantId(c);
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
    return c.json({ error: "Failed to update settings" }, 500);
  }

  return c.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    address: updated.address,
    phone: updated.phone,
    email: updated.email,
    logoUrl: updated.logoUrl,
  });
});

// PATCH /notification-preference — self-service: the current user opts in/out
// of receiving every order's notification in this tenant.
settingsRouter.patch("/notification-preference", async (c) => {
  const tenantId = c.get("tenantId");
  const user = c.get("user");
  if (!tenantId || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json();
  const parsed = updateNotificationPreferenceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [updated] = await db
    .update(tenantMemberships)
    .set({ notifyAllOrders: parsed.data.notifyAllOrders })
    .where(and(eq(tenantMemberships.userId, user.id), eq(tenantMemberships.tenantId, tenantId)))
    .returning({ notifyAllOrders: tenantMemberships.notifyAllOrders });

  if (!updated) {
    return c.json({ error: "Membership not found" }, 404);
  }

  return c.json({ notifyAllOrders: updated.notifyAllOrders });
});

export { settingsRouter };
