import { Hono } from "hono";
import { sql as dsql } from "drizzle-orm";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import * as Sentry from "@sentry/node";
import { config } from "./config";
import { db } from "./db/connection";
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
// Single-origin app: only the canonical origin may make credentialed
// cross-origin requests. Same-origin requests (the normal case — the SPA and
// API share one origin) don't send an Origin header and are unaffected.
app.use(
  "*",
  cors({
    origin: [config.appOrigin],
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
  c.set("customerId", null);
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

app.get("/api/health", async (c) => {
  // A static body kept Caddy/compose routing traffic to an API whose DB
  // connection was dead. Cheap select 1 with a short timeout instead.
  try {
    await Promise.race([
      db.execute(dsql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db health timeout")), 2000)),
    ]);
    return c.json({ status: "ok", version: config.appVersion });
  } catch {
    return c.json({ status: "degraded", db: "unreachable" }, 503);
  }
});

// Postgres "the input itself is malformed" SQLSTATEs: a garbage :id reaching
// a uuid-typed comparison (22P02) or a garbage date (22007/22008). Client
// input problems — 400, not a 500 + Sentry event. Zod validation at the
// boundary remains the first line; this is the safety net.
const PG_INVALID_INPUT_CODES = new Set(["22P02", "22007", "22008"]);

function isPgInvalidInput(err: unknown): boolean {
  let cur = err as { code?: string; cause?: unknown } | null;
  for (let depth = 0; cur && typeof cur === "object" && depth < 5; depth++) {
    if (cur.code && PG_INVALID_INPUT_CODES.has(cur.code)) return true;
    cur = (cur.cause ?? null) as { code?: string; cause?: unknown } | null;
  }
  return false;
}

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      Sentry.captureException(err);
    }
    return err.getResponse();
  }
  if (isPgInvalidInput(err)) {
    return c.json({ error: "Invalid parameter format" }, 400);
  }
  // c.req.json() throws SyntaxError on malformed/empty bodies — client input,
  // not a server fault.
  if (err instanceof SyntaxError) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  Sentry.captureException(err);
  return c.json({ error: "Internal server error" }, 500);
});

export { app };
