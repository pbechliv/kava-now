import { Hono } from "hono";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { catalogRouter } from "./catalog";
import { ordersRouter } from "./orders";
import { profileRouter } from "./profile";
import type { AppEnv } from "../../types";

const customerRoutes = new Hono<AppEnv>();

// Apply auth + role middleware to all customer routes
customerRoutes.use("*", requireAuth);
customerRoutes.use("*", requireRole("customer"));

customerRoutes.route("/catalog", catalogRouter);
customerRoutes.route("/orders", ordersRouter);
customerRoutes.route("/profile", profileRouter);

export { customerRoutes };
