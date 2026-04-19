import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

type Role = "owner" | "staff" | "customer" | "superadmin";

export function requireRole(...roles: Array<Role>) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Απαιτείται σύνδεση" }, 401);
    }

    if (!user.role || !roles.includes(user.role as Role)) {
      return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
    }

    // Tenant scoping: non-superadmin users must be on their own kava's subdomain
    const kavaId = c.get("kavaId");
    if (user.role !== "superadmin" && kavaId && user.kavaId !== kavaId) {
      return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
    }

    return next();
  });
}
