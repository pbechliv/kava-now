import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../db/connection";
import { kavas } from "../db/schema/index";
import { config } from "../config";
import type { AppEnv } from "../types";

export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const host = c.req.header("host") || "";
  const hostWithoutPort = host.split(":")[0] || "";
  const baseDomainWithoutPort = config.baseDomain.split(":")[0] || "";

  // Check if this is the bare domain (platform mode)
  if (
    hostWithoutPort === baseDomainWithoutPort ||
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1"
  ) {
    c.set("isPlatform", true);
    c.set("isSuperAdmin", false);
    c.set("kava", null);
    c.set("kavaId", null);
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  // Extract subdomain
  const subdomain = hostWithoutPort.replace(`.${baseDomainWithoutPort}`, "");

  if (!subdomain || subdomain === hostWithoutPort) {
    c.set("isPlatform", true);
    c.set("isSuperAdmin", false);
    c.set("kava", null);
    c.set("kavaId", null);
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  // Superadmin panel
  if (subdomain === "admin") {
    c.set("isPlatform", false);
    c.set("isSuperAdmin", true);
    c.set("kava", null);
    c.set("kavaId", null);
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  // Look up kava by slug
  const [kava] = await db.select().from(kavas).where(eq(kavas.slug, subdomain)).limit(1);

  if (!kava) {
    return c.json({ error: "Κάβα δεν βρέθηκε" }, 404);
  }

  c.set("isPlatform", false);
  c.set("isSuperAdmin", false);
  c.set("kava", kava);
  c.set("kavaId", kava.id);
  c.set("user", null);
  c.set("session", null);

  // Set PostgreSQL session variable for RLS
  await queryClient`SELECT set_config('app.current_kava_id', ${kava.id}, false)`;

  return next();
});
