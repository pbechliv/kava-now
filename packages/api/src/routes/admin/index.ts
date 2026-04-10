import { Hono } from "hono";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { productsRouter } from "./products";
import { categoriesRouter } from "./categories";
import { seedCatalogRouter } from "./seed-catalog";
import type { AppEnv } from "../../types";

const adminRoutes = new Hono<AppEnv>();

// Apply auth + role middleware to all admin routes
adminRoutes.use("*", requireAuth);
adminRoutes.use("*", requireRole("owner", "staff"));

adminRoutes.route("/products", productsRouter);
adminRoutes.route("/categories", categoriesRouter);
adminRoutes.route("/seed-catalog", seedCatalogRouter);

export { adminRoutes };
