import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { products } from "./products";
import { orderItemStatusEnum } from "./enums";

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    originalQuantity: integer("original_quantity"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    productName: text("product_name").notNull(),
    status: orderItemStatusEnum("status").notNull().default("active"),
    replacedByItemId: uuid("replaced_by_item_id").references((): AnyPgColumn => orderItems.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // Per-order item fetch (order detail, totals aggregation).
    index("order_items_order_idx").on(table.orderId),
    // Product usage lookups (e.g. "is this product referenced by orders").
    index("order_items_product_idx").on(table.productId),
  ],
);
