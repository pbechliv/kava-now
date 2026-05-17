import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
