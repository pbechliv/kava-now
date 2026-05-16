import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import type { MembershipRole } from "@kava-now/shared";
import { db } from "../db/connection";
import { kavaMemberships } from "../db/schema/index";
import type { AppEnv } from "../types";

/**
 * Require the authenticated user to have a kava_memberships row in the kava
 * resolved by `tenantMiddleware`, with one of the allowed roles. The resolved
 * membership is exposed on the request context via `c.get("membership")`.
 *
 * Superadmins bypass this check; their membership is set to a synthetic
 * `owner` so downstream code can rely on `c.get("membership")` being non-null
 * for tenant-scoped routes.
 */
export function requireRole(...roles: Array<MembershipRole>) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Απαιτείται σύνδεση" }, 401);
    }

    const kavaId = c.get("kavaId");
    if (!kavaId) {
      return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
    }

    if (user.isSuperAdmin) {
      c.set("membership", { role: "owner", customerId: null });
      return next();
    }

    const [membership] = await db
      .select({
        role: kavaMemberships.role,
        customerId: kavaMemberships.customerId,
      })
      .from(kavaMemberships)
      .where(and(eq(kavaMemberships.userId, user.id), eq(kavaMemberships.kavaId, kavaId)))
      .limit(1);

    if (!membership || !roles.includes(membership.role)) {
      return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
    }

    c.set("membership", membership);
    return next();
  });
}
