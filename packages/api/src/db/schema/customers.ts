import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { kavas } from "./kavas";

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  kavaId: uuid("kava_id")
    .notNull()
    .references(() => kavas.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  address: text("address"),
  phone: text("phone"),
  contactPerson: text("contact_person"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
