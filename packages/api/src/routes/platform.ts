import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { kavaSlugSchema } from "@kava-now/shared";
import { db } from "../db/connection";
import { kavas } from "../db/schema/index";
import type { AppEnv } from "../types";

const platform = new Hono<AppEnv>();

// GET /platform/kava-exists?slug=demo — check if a kava slug exists
platform.get("/kava-exists", async (c) => {
  const parsed = kavaSlugSchema.safeParse({ slug: c.req.query("slug") });
  if (!parsed.success) {
    return c.json({ exists: false });
  }

  const [found] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, parsed.data.slug))
    .limit(1);

  return c.json({ exists: !!found });
});

export { platform as platformRoutes };
