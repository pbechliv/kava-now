import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import * as Sentry from "@sentry/node";
import { tenantMiddleware } from "./middleware/tenant";
import { authMiddleware } from "./middleware/auth";
import { sentryContextMiddleware } from "./middleware/sentry-context";
import { signInRateLimit, forgotPasswordRateLimit } from "./middleware/rate-limit";
import { auth } from "./auth";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin/index";
import { customerRoutes } from "./routes/customer/index";
import { superadminRoutes } from "./routes/superadmin/index";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
  }),
);

// Default empty tenant context; tenant-scoped routes set it explicitly.
app.use("*", async (c, next) => {
  c.set("tenant", null);
  c.set("tenantId", null);
  c.set("user", null);
  c.set("session", null);
  c.set("membership", null);
  return next();
});

// Auth session resolution — no tenant context required.
app.use("*", authMiddleware);

// Attach tenant + user context to Sentry scope (after tenant + auth populate vars)
app.use("*", sentryContextMiddleware);

// Custom auth routes (register BEFORE better-auth catch-all so /me matches first)
app.route("/api/auth", authRoutes);

// Rate limits on auth endpoints exposed to unauthenticated traffic.
app.use("/api/auth/sign-in/*", signInRateLimit);
app.use("/api/auth/sign-in", signInRateLimit);
app.use("/api/auth/request-password-reset", forgotPasswordRateLimit);

// better-auth handler — owns /api/auth/{sign-in, sign-out, sign-up,
// get-session, forget-password, reset-password, etc.}
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/superadmin", superadminRoutes);

// Tenant-scoped routes. tenantMiddleware reads the :slug param, resolves the
// tenant, and sets the PostgreSQL session variable for RLS.
const tenantApp = new Hono<AppEnv>();
tenantApp.use("*", tenantMiddleware);
// Re-tag Sentry scope now that the tenant (and later, membership via
// requireRole) is resolved for tenant-scoped requests.
tenantApp.use("*", sentryContextMiddleware);

tenantApp.get("/tenant", (c) => {
  const tenant = c.get("tenant");
  if (!tenant) return c.json({ error: "Tenant not found" }, 404);
  return c.json({ name: tenant.name, slug: tenant.slug });
});

tenantApp.route("/admin", adminRoutes);
tenantApp.route("/customer", customerRoutes);

app.route("/api/k/:slug", tenantApp);

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      Sentry.captureException(err);
    }
    return err.getResponse();
  }
  Sentry.captureException(err);
  return c.json({ error: "Internal server error" }, 500);
});

export { app };
