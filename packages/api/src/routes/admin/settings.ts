import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { kavas } from "../../db/schema/index";
import type { AppEnv } from "../../types";

const settingsRouter = new Hono<AppEnv>();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { name, address, phone, email, notificationEmails, logoUrl } = body as {
    name?: string;
    address?: string | null;
    phone?: string | null;
    email?: string;
    notificationEmails?: string[];
    logoUrl?: string | null;
  };

  // Validate notificationEmails
  if (notificationEmails !== undefined) {
    if (!Array.isArray(notificationEmails)) {
      return c.json({ error: "Τα email ειδοποιήσεων πρέπει να είναι πίνακας" }, 400);
    }
    for (const e of notificationEmails) {
      if (typeof e !== "string" || !EMAIL_REGEX.test(e)) {
        return c.json({ error: `Μη έγκυρο email ειδοποίησης: ${e}` }, 400);
      }
    }
  }

  // Build update fields
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (address !== undefined) updateData.address = address;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (notificationEmails !== undefined) updateData.notificationEmails = notificationEmails;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: "Δεν δόθηκαν πεδία για ενημέρωση" }, 400);
  }

  const [updated] = await db.update(kavas).set(updateData).where(eq(kavas.id, kavaId)).returning();

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
