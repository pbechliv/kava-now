import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tenantMiddleware } from "./middleware/tenant";
import { authMiddleware } from "./middleware/auth";
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

// Routes
app.route("/api/auth", authRoutes);
app.route("/api/platform", platformRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/customer", customerRoutes);
app.route("/api/superadmin", superadminRoutes);

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    tenant: c.get("kava")?.slug || "platform",
  });
});

export { app };
