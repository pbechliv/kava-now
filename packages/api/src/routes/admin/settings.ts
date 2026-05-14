import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { updateKavaSettingsSchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { kavas } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const settingsRouter = new Hono<AppEnv>();

// GET / — return current kava record
settingsRouter.get("/", async (c) => {
  const kava = c.get("kava")!;
  return c.json({
    id: kava.id,
    name: kava.name,
    slug: kava.slug,
    address: kava.address,
    phone: kava.phone,
    email: kava.email,
    notificationEmails: kava.notificationEmails,
    logoUrl: kava.logoUrl,
  });
});

// PUT / — update kava fields
settingsRouter.put("/", async (c) => {
  const kavaId = c.get("kavaId")!;
  const body = await c.req.json();
  const parsed = updateKavaSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const [updated] = await db.update(kavas).set(parsed.data).where(eq(kavas.id, kavaId)).returning();

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
