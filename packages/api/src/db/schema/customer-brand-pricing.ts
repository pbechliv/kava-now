import { pgTable, uuid, text, numeric, primaryKey } from "drizzle-orm/pg-core";
import { customers } from "./customers";

export const customerBrandPricing = pgTable(
  "customer_brand_pricing",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  },
  (table) => [primaryKey({ columns: [table.customerId, table.brand] })],
);
