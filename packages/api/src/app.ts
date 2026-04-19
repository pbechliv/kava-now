import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tenantMiddleware } from "./middleware/tenant";
import { authMiddleware } from "./middleware/auth";
import {
  signInRateLimit,
  magicLinkRateLimit,
  forgotPasswordRateLimit,
} from "./middleware/rate-limit";
import { auth } from "./auth";
import { authRoutes } from "./routes/auth";
import { platformRoutes } from "./routes/platform";
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

// Tenant resolution on all routes
app.use("*", tenantMiddleware);

// Auth session resolution (after tenant)
app.use("*", authMiddleware);

// Custom auth routes (register BEFORE better-auth catch-all so /me matches first)
app.route("/api/auth", authRoutes);

// Rate limits on auth endpoints exposed to unauthenticated traffic.
app.use("/api/auth/sign-in/*", signInRateLimit);
app.use("/api/auth/sign-in", signInRateLimit);
app.use("/api/auth/magic-link", magicLinkRateLimit);
app.use("/api/auth/forget-password", forgotPasswordRateLimit);

// better-auth handler — owns /api/auth/{sign-in, sign-out, sign-up,
// get-session, forget-password, reset-password, magic-link/*, etc.}
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/platform", platformRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/customer", customerRoutes);
app.route("/api/superadmin", superadminRoutes);

// Public kava info (tenant mode only, no auth required)
app.get("/api/kava", (c) => {
  const kava = c.get("kava");
  if (!kava) {
    return c.json({ error: "Not in tenant mode" }, 404);
  }
  return c.json({ name: kava.name, slug: kava.slug });
});

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    tenant: c.get("kava")?.slug || "platform",
  });
});

export { app };
