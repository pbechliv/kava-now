import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { erpStatusEnum, orderStatusEnum } from "./enums";
import { kavas } from "./kavas";
import { customers } from "./customers";
import { users } from "./users";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  erpStatus: erpStatusEnum("erp_status").notNull().default("pending"),
  erpMark: text("erp_mark"),
  erpTransmittedAt: timestamp("erp_transmitted_at", { withTimezone: true }),
  erpTransmittedBy: uuid("erp_transmitted_by").references(() => users.id, {
    onDelete: "set null",
  }),
});
