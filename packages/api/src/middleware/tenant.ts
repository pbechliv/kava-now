import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../db/connection";
import { kavas } from "../db/schema/index";
import type { AppEnv } from "../types";

export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const slug = c.req.param("slug");

  if (!slug) {
    c.set("kava", null);
    c.set("kavaId", null);
    return next();
  }

  const [kava] = await db.select().from(kavas).where(eq(kavas.slug, slug)).limit(1);

  if (!kava) {
    return c.json({ error: "Κάβα δεν βρέθηκε" }, 404);
  }

  c.set("kava", kava);
  c.set("kavaId", kava.id);

  // Set PostgreSQL session variable for RLS
  await queryClient`SELECT set_config('app.current_kava_id', ${kava.id}, false)`;

  return next();
});
