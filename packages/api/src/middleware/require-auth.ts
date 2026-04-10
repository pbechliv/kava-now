import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Απαιτείται σύνδεση" }, 401);
  }

  return next();
});
