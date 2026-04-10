import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tenantMiddleware } from "./middleware/tenant";
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

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    tenant: c.get("kava")?.slug || "platform",
  });
});

export { app };
