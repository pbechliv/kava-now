import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "staff",
  "customer",
  "superadmin",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

export const productUnitEnum = pgEnum("product_unit", [
  "bottle",
  "case",
  "keg",
]);
