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

// NOTE: order_items has no tenant_id column — unlike every other tenant-scoped
// table, its RLS policy scopes indirectly via the parent order
// (order_id IN (SELECT id FROM orders WHERE tenant_id = current_tenant_id())).
// Queries against order_items must always join/filter through orders.
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // "no action" (not cascade): line items are audit history — deleting a
    // product must never destroy them. DEFERRABLE INITIALLY DEFERRED by hand
    // in drizzle/0001 — see orders.customerId for the full story.
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "no action" }),
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
    // SET NULL in the replacement chain scans this FK.
    index("order_items_replaced_by_idx").on(table.replacedByItemId),
  ],
);
