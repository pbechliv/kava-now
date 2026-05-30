import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, runWithTenant } from "../db/connection";
import { tenants } from "../db/schema/index";
import type { AppEnv } from "../types";

export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const slug = c.req.param("slug");

  if (!slug) {
    c.set("tenant", null);
    c.set("tenantId", null);
    return next();
  }

  // Tenant lookup runs on the base pool — no tenant context yet, and `tenants`
  // has no RLS (it must be readable before the RLS variable can be set).
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  c.set("tenant", tenant);
  c.set("tenantId", tenant.id);

  // Run the remainder of the request inside a transaction whose connection has
  // `app.current_tenant_id` set transaction-locally, so every query made
  // through `db` is isolated to this tenant by RLS. The variable is discarded
  // on commit/rollback, so it cannot leak to another pooled request.
  return runWithTenant(tenant.id, () => next());
});
