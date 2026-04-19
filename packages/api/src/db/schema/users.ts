import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";
import { kavas } from "./kavas";
import { customers } from "./customers";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  role: userRoleEnum("role").notNull().default("customer"),
  kavaId: uuid("kava_id").references(() => kavas.id, {
    onDelete: "cascade",
  }),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
});
