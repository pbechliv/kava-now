import { createMiddleware } from "hono/factory";
import * as Sentry from "@sentry/node";
import type { AppEnv } from "../types";

export const sentryContextMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const kava = c.get("kava");
  const user = c.get("user");
  const membership = c.get("membership");

  const scope = Sentry.getCurrentScope();
  scope.setTags({
    "kava.slug": kava?.slug ?? null,
    "kava.id": kava?.id ?? null,
    "user.is_superadmin": user?.isSuperAdmin ?? false,
    "membership.role": membership?.role ?? null,
  });

  if (user) {
    scope.setUser({ id: user.id });
  }

  await next();
});
