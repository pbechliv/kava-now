import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { registerSchema, paginationQuerySchema } from "@kava-now/shared";
import { db } from "../../db/connection";
import { tenantMemberships, tenants, users } from "../../db/schema/index";
import { auth } from "../../auth";
import { sendInviteSetPassword } from "../../services/invite-user";
import { requireAuth } from "../../middleware/require-auth";
import { requireSuperAdmin } from "../../middleware/require-superadmin";
import { logAudit } from "../../services/audit";
import type { AppEnv } from "../../types";

const superadmin = new Hono<AppEnv>();

superadmin.use("*", requireAuth);
superadmin.use("*", requireSuperAdmin);

// GET /superadmin/tenants — list all tenants
superadmin.get("/tenants", async (c) => {
  const pagination = paginationQuerySchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!pagination.success) {
    return c.json({ error: pagination.error.flatten().fieldErrors }, 400);
  }
  const { page, pageSize } = pagination.data;

  const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(tenants);
  const total = countRow?.total ?? 0;

  const data = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      email: tenants.email,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(tenants.createdAt, tenants.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({ data, total, page, pageSize });
});

// POST /superadmin/tenants — create tenant + owner user + membership
superadmin.post("/tenants", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, slug, email, password } = parsed.data;

  const [existingTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (existingTenant) {
    return c.json({ error: "Αυτό το slug χρησιμοποιείται ήδη" }, 409);
  }

  const [tenant] = await db.insert(tenants).values({ name, slug, email }).returning();
  if (!tenant) throw new Error("Αποτυχία δημιουργίας λογαριασμού");

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

  await db.insert(tenantMemberships).values({
    userId: ownerUserId,
    tenantId: tenant.id,
    role: "owner",
  });

  if (!existingUser && !password) {
    await sendInviteSetPassword(c, email, slug);
  }

  await logAudit(c, {
    action: "superadmin.tenant.create",
    targetType: "tenant",
    targetId: tenant.id,
    metadata: { name, slug, ownerEmail: email, hasPassword: !!password },
  });

  return c.json({ success: true, slug, hasPassword: !!password });
});

// DELETE /superadmin/tenants/:id — hard delete a tenant (memberships cascade)
superadmin.delete("/tenants/:id", async (c) => {
  const id = c.req.param("id");

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!tenant) {
    return c.json({ error: "Δεν βρέθηκε λογαριασμό" }, 404);
  }

  const [full] = await db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  await db.delete(tenants).where(eq(tenants.id, id));

  await logAudit(c, {
    action: "superadmin.tenant.delete",
    targetType: "tenant",
    targetId: id,
    metadata: { name: full?.name, slug: full?.slug },
  });

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
