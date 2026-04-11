import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export function requireRole(...roles: Array<"owner" | "staff" | "customer" | "superadmin">) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Απαιτείται σύνδεση" }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
    }

    return next();
  });
}
