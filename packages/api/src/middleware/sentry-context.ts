import { createMiddleware } from "hono/factory";
import * as Sentry from "@sentry/node";
import type { AppEnv } from "../types";

export const sentryContextMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const membership = c.get("membership");

  const scope = Sentry.getCurrentScope();
  scope.setTags({
    "tenant.slug": tenant?.slug ?? null,
    "tenant.id": tenant?.id ?? null,
    "user.is_superadmin": user?.isSuperAdmin ?? false,
    "membership.role": membership?.role ?? null,
  });

  if (user) {
    scope.setUser({ id: user.id });
  }

  await next();
});
