import { pgEnum } from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "staff", "customer"]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

export const productUnitEnum = pgEnum("product_unit", ["bottle", "case", "keg"]);

export const erpStatusEnum = pgEnum("erp_status", ["pending", "transmitted"]);
