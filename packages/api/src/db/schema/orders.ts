import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { orderStatusEnum } from "./enums";
import { kavas } from "./kavas";
import { customers } from "./customers";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  kavaId: uuid("kava_id")
    .notNull()
    .references(() => kavas.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  status: orderStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
