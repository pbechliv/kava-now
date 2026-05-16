import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { membershipRoleEnum } from "./enums";
import { kavas } from "./kavas";
import { customers } from "./customers";
import { users } from "./users";

/**
 * Many-to-many between users and kavas. Each row grants a single role to a
 * user inside one kava. `customerId` is non-null only for customer-role rows,
 * linking the user to a specific customer entity within that kava.
 */
export const kavaMemberships = pgTable(
  "kava_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kavaId: uuid("kava_id")
      .notNull()
      .references(() => kavas.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    invitedById: uuid("invited_by_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kava_memberships_user_kava_idx").on(table.userId, table.kavaId),
    index("kava_memberships_kava_idx").on(table.kavaId),
    index("kava_memberships_customer_idx").on(table.customerId),
  ],
);
