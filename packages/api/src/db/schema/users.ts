import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, uuid, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";
import { kavas } from "./kavas";
import { customers } from "./customers";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Synthesized identifier used by better-auth (globally unique).
    // For tenant users: `<local>_at_<domain>--<slug>@kava.internal`.
    // For superadmin: equals realEmail.
    email: text("email").notNull().unique(),
    // The actual email shown to humans and used for sending mail.
    realEmail: text("real_email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name").notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    role: userRoleEnum("role").notNull().default("customer"),
    kavaId: uuid("kava_id").references(() => kavas.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    invitedById: uuid("invited_by_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [uniqueIndex("users_real_email_kava_id_idx").on(table.realEmail, table.kavaId)],
);
