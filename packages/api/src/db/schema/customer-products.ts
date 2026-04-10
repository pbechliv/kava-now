import {
  pgTable,
  uuid,
  numeric,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { products } from "./products";

export const customerProducts = pgTable(
  "customer_products",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customPrice: numeric("custom_price", { precision: 10, scale: 2 }),
    active: boolean("active").notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.customerId, table.productId] })],
);
