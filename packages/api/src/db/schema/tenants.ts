import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  address: text("address"),
  phone: text("phone"),
  email: text("email").notNull(),
  // Monotonic per-tenant counter for human-friendly order numbers (#161).
  // Bumped (UPDATE ... RETURNING, row-locked) inside each order-creation
  // transaction to allocate orders.orderNumber; never surfaced to clients.
  orderCounter: integer("order_counter").notNull().default(0),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
