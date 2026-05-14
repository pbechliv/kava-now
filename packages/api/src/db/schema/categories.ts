import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { kavas } from "./kavas";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  kavaId: uuid("kava_id")
    .notNull()
    .references(() => kavas.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
