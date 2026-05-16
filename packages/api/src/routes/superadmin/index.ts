import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { registerSchema, paginationQuerySchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { kavaMemberships, kavas, users } from "../../db/schema/index";
import { auth } from "../../auth";
import { sendInviteSetPassword } from "../../services/invite-user";
import { requireAuth } from "../../middleware/require-auth";
import { requireSuperAdmin } from "../../middleware/require-superadmin";
import { logAudit } from "../../services/audit";
import type { AppEnv } from "../../types";

const superadmin = new Hono<AppEnv>();

superadmin.use("*", requireAuth);
superadmin.use("*", requireSuperAdmin);

// GET /superadmin/kavas — list all tenants
superadmin.get("/kavas", async (c) => {
  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(kavas);
  const total = countRow?.total ?? 0;

  const data = await db
    .select({
      id: kavas.id,
      name: kavas.name,
      slug: kavas.slug,
      email: kavas.email,
      createdAt: kavas.createdAt,
    })
    .from(kavas)
    .orderBy(kavas.createdAt, kavas.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({ data, total, page, pageSize });
});

// POST /superadmin/kavas — create kava + owner user + membership
superadmin.post("/kavas", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, slug, email, password } = parsed.data;

  const [existingKava] = await db
    .select({ id: kavas.id })
    .from(kavas)
    .where(eq(kavas.slug, slug))
    .limit(1);

  if (existingKava) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

  const [kava] = await db.insert(kavas).values({ name, slug, email }).returning();
  if (!kava) throw new Error("Αποτυχία δημιουργίας κάβας");

  // Find or create the owner user.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let ownerUserId: string;
  if (existingUser) {
    ownerUserId = existingUser.id;
  } else if (password) {
    // Create the user via better-auth so they get a credential account.
    await auth.api.signUpEmail({ body: { email, password, name } });
    const [created] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!created) throw new Error("Αποτυχία δημιουργίας χρήστη");
    ownerUserId = created.id;
  } else {
    // No password yet — create the user row, attach the membership, send invite.
    const [created] = await db
      .insert(users)
      .values({ email, name, emailVerified: false })
      .returning({ id: users.id });
    if (!created) throw new Error("Αποτυχία δημιουργίας χρήστη");
    ownerUserId = created.id;
  }

  await db.insert(kavaMemberships).values({
    userId: ownerUserId,
    kavaId: kava.id,
    role: "owner",
  });

  if (!existingUser && !password) {
    await sendInviteSetPassword(c, email, slug);
  }

  await logAudit(c, {
    action: "superadmin.kava.create",
    targetType: "kava",
    targetId: kava.id,
    metadata: { name, slug, ownerEmail: email, hasPassword: !!password },
  });

  return c.json({ success: true, slug, hasPassword: !!password });
});

// DELETE /superadmin/kavas/:id — hard delete a tenant (memberships cascade)
superadmin.delete("/kavas/:id", async (c) => {
  const id = c.req.param("id");

  const [kava] = await db.select({ id: kavas.id }).from(kavas).where(eq(kavas.id, id)).limit(1);
  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 404);
  }

  const [full] = await db
    .select({ name: kavas.name, slug: kavas.slug })
    .from(kavas)
    .where(eq(kavas.id, id))
    .limit(1);

  await db.delete(kavas).where(eq(kavas.id, id));

  await logAudit(c, {
    action: "superadmin.kava.delete",
    targetType: "kava",
    targetId: id,
    metadata: { name: full?.name, slug: full?.slug },
  });

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
