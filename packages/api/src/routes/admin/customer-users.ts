import { validationError } from "../../validation";
import { Hono } from "hono";
import { eq, and, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  adminCustomerUsersQuerySchema,
  type AdminCustomerUserListItem,
  type PaginatedResponse,
} from "@kava-now/shared";
import { db } from "../../db/connection";
import { accentInsensitiveLike } from "../../db/search";
import { customers, tenantMemberships, users } from "../../db/schema/index";
import type { AppEnv } from "../../types";
import type { PreSerialize } from "../../serialize";
import { getTenantId } from "../../context";

const customerUsersRouter = new Hono<AppEnv>();

// GET / — customer-linked users in this tenant, each tagged with its customer.
// Serves both customer-user lists: unfiltered it's the tenant-wide view, with
// `?customerId=` it's one customer's users. Invite / resend / delete stay on the
// existing endpoints (/admin/customers/:id/users/invite, /admin/users/:id/*).
customerUsersRouter.get("/", async (c) => {
  const tenantId = getTenantId(c);
  const inviterAlias = alias(users, "inviter");

  const parsed = adminCustomerUsersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }
  const { search, customerId, page, pageSize } = parsed.data;

  // An unknown customer is a 404, not an empty list — otherwise a stale or
  // typo'd id reads as "this customer has no users".
  if (customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
  }

  const conditions = [
    eq(tenantMemberships.tenantId, tenantId),
    eq(tenantMemberships.role, "customer"),
  ];

  if (customerId) {
    conditions.push(eq(tenantMemberships.customerId, customerId));
  }

  if (search) {
    const match = or(
      accentInsensitiveLike(users.name, search),
      accentInsensitiveLike(users.email, search),
      accentInsensitiveLike(customers.name, search),
    );
    if (match) conditions.push(match);
  }

  const whereClause = and(...conditions);

  // The joins mirror the row query so the count matches what the page lists —
  // the inner join on customers also drops any customer-role membership whose
  // customerId is null (there shouldn't be one) and applies the search.
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .innerJoin(customers, eq(customers.id, tenantMemberships.customerId))
    .where(whereClause);
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      name: users.name,
      createdAt: tenantMemberships.createdAt,
      invitedByName: inviterAlias.name,
      invitedByEmail: inviterAlias.email,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .innerJoin(customers, eq(customers.id, tenantMemberships.customerId))
    .leftJoin(inviterAlias, eq(tenantMemberships.invitedById, inviterAlias.id))
    .where(whereClause)
    .orderBy(customers.name, users.name, users.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const body = {
    data: rows,
    total,
    page,
    pageSize,
  } satisfies PreSerialize<PaginatedResponse<AdminCustomerUserListItem>>;
  return c.json(body);
});

export { customerUsersRouter };
