import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { registerSchema, paginationQuerySchema, API_ERROR_CODES } from "@kava-now/shared";
import { db } from "../../db/connection";
import { tenantMemberships, tenants, users } from "../../db/schema/index";
import { auth } from "../../auth";
import { sendInviteSetPassword } from "../../services/invite-user";
import { requireAuth } from "../../middleware/require-auth";
import { requireSuperAdmin } from "../../middleware/require-superadmin";
import { isUniqueViolation, UNIQUE_CONSTRAINTS } from "../../db/errors";
import type { AppEnv } from "../../types";

const DUPLICATE_TENANT_SLUG_RESPONSE = {
  code: API_ERROR_CODES.DUPLICATE_TENANT_SLUG,
  error: "Tenant slug is already taken",
} as const;

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
    return c.json(DUPLICATE_TENANT_SLUG_RESPONSE, 409);
  }

  let tenant;
  try {
    [tenant] = await db.insert(tenants).values({ name, slug, email }).returning();
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.tenantSlug)) {
      return c.json(DUPLICATE_TENANT_SLUG_RESPONSE, 409);
    }
    throw err;
  }
  if (!tenant) throw new Error("Tenant insert returned no row");

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
    if (!created) throw new Error("User insert returned no row");
    ownerUserId = created.id;
  } else {
    // No password yet — create the user row, attach the membership, send invite.
    const [created] = await db
      .insert(users)
      .values({ email, name, emailVerified: false })
      .returning({ id: users.id });
    if (!created) throw new Error("User insert returned no row");
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
    return c.json({ error: "Tenant not found" }, 404);
  }

  await db.delete(tenants).where(eq(tenants.id, id));

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
