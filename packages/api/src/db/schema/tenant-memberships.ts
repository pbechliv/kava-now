import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { membershipRoleEnum } from "./enums";
import { tenants } from "./tenants";
import { customers } from "./customers";
import { users } from "./users";

/**
 * Many-to-many between users and tenants. Each row grants a single role to a
 * user inside one tenant. `customerId` is non-null only for customer-role
 * rows, linking the user to a specific customer entity within that tenant.
 */
export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
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
    uniqueIndex("tenant_memberships_user_tenant_idx").on(table.userId, table.tenantId),
    index("tenant_memberships_tenant_idx").on(table.tenantId),
    index("tenant_memberships_customer_idx").on(table.customerId),
  ],
);
