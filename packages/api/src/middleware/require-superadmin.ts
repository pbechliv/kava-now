import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireSuperAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");

  if (!user || user.role !== "superadmin") {
    return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
  }

  return next();
});
