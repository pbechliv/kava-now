import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../db/connection";
import { tenants } from "../db/schema/index";
import type { AppEnv } from "../types";

export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const slug = c.req.param("slug");

  if (!slug) {
    c.set("tenant", null);
    c.set("tenantId", null);
    return next();
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  c.set("tenant", tenant);
  c.set("tenantId", tenant.id);

  // Set PostgreSQL session variable for RLS
  await queryClient`SELECT set_config('app.current_tenant_id', ${tenant.id}, false)`;

  return next();
});
