import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { registerSchema, paginationQuerySchema, API_ERROR_CODES } from "@kava-now/shared";
import { db } from "../../db/connection";
import { tenants } from "../../db/schema/index";
import { createTenantWithOwner } from "../../services/create-tenant";
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

  // Fast pre-check for a friendly 409; the unique index is the real guard.
  const [existingTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (existingTenant) {
    return c.json(DUPLICATE_TENANT_SLUG_RESPONSE, 409);
  }

  // Tenant + owner user + membership are created atomically — a failure can
  // never leave an owner-less tenant.
  let result;
  try {
    result = await createTenantWithOwner({ name, slug, email, password });
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.tenantSlug)) {
      return c.json(DUPLICATE_TENANT_SLUG_RESPONSE, 409);
    }
    throw err;
  }

  // Brand-new owner without a password → send the set-password invite.
  // Best-effort: the tenant/user/membership are already committed.
  if (result.isNewUser && !password) {
    try {
      await sendInviteSetPassword(c, email, slug);
    } catch (err) {
      console.error("[superadmin] Failed to send owner invite email:", err);
    }
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
