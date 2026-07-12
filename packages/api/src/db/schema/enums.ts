import { pgEnum } from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "staff", "customer"]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  // Customer-initiated cancellation, kept distinct from staff `cancelled`:
  // `cancellation_requested` = customer asked to cancel a confirmed order
  // (awaiting staff); `cancelled_by_customer` = finalized customer cancellation
  // (immediate from `pending`, or an approved request).
  "cancellation_requested",
  "cancelled_by_customer",
]);

export const productUnitEnum = pgEnum("product_unit", ["bottle", "case", "keg"]);

export const erpStatusEnum = pgEnum("erp_status", ["pending", "transmitted"]);

export const orderItemStatusEnum = pgEnum("order_item_status", ["active", "cancelled"]);

// Where an order came from: `portal` = the customer placed it themselves through
// their portal; `manual` = staff created it on the customer's behalf (phone,
// walk-in, or any in-person intake). Defaults to `portal` — every pre-existing
// order is a portal order (#159).
export const orderOriginEnum = pgEnum("order_origin", ["portal", "manual"]);
