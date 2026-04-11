import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { kavas } from "../../db/schema/index";
import { requireAuth } from "../../middleware/require-auth";
import { requireSuperAdmin } from "../../middleware/require-superadmin";
import type { AppEnv } from "../../types";

const superadmin = new Hono<AppEnv>();

superadmin.use("*", requireAuth);
superadmin.use("*", requireSuperAdmin);

// GET /superadmin/kavas — list all tenants
superadmin.get("/kavas", async (c) => {
  const allKavas = await db
    .select({
      id: kavas.id,
      name: kavas.name,
      slug: kavas.slug,
      email: kavas.email,
      createdAt: kavas.createdAt,
    })
    .from(kavas)
    .orderBy(kavas.createdAt);

  return c.json({ kavas: allKavas });
});

// DELETE /superadmin/kavas/:id — hard delete a tenant
superadmin.delete("/kavas/:id", async (c) => {
  const id = c.req.param("id");

  const [kava] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.id, id))
    .limit(1);

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 404);
  }

  await db.delete(kavas).where(eq(kavas.id, id));

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
