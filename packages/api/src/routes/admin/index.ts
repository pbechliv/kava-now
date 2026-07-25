import { Hono } from "hono";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { productsRouter } from "./products";
import { categoriesRouter } from "./categories";
import { customersRouter } from "./customers";
import { customerUsersRouter } from "./customer-users";
import { ordersRouter } from "./orders";
import { adminCatalogRouter } from "./catalog";
import { dashboardRouter } from "./dashboard";
import { settingsRouter } from "./settings";
import { usersRouter } from "./users";
import type { AppEnv } from "../../types";

const adminRoutes = new Hono<AppEnv>();

// Apply auth + role middleware to all admin routes
adminRoutes.use("*", requireAuth);
adminRoutes.use("*", requireRole("owner", "staff"));

adminRoutes.route("/products", productsRouter);
adminRoutes.route("/categories", categoriesRouter);
adminRoutes.route("/customers", customersRouter);
adminRoutes.route("/customer-users", customerUsersRouter);
adminRoutes.route("/orders", ordersRouter);
adminRoutes.route("/catalog", adminCatalogRouter);
adminRoutes.route("/dashboard", dashboardRouter);
adminRoutes.route("/settings", settingsRouter);
adminRoutes.route("/users", usersRouter);

export { adminRoutes };
