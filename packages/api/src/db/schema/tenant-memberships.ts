import { type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
    customerId: uuid("customer_id"),
    invitedById: uuid("invited_by_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_memberships_user_tenant_idx").on(table.userId, table.tenantId),
    index("tenant_memberships_tenant_idx").on(table.tenantId),
    index("tenant_memberships_customer_idx").on(table.customerId),
    // Composite FK: the linked customer must belong to the SAME tenant as the
    // membership — RLS scopes by the denormalized tenant_id, so a cross-tenant
    // link would be an isolation defect, not just dirt.
    foreignKey({
      name: "tenant_memberships_customer_tenant_fk",
      columns: [table.customerId, table.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }).onDelete("cascade"),
    check(
      "tenant_memberships_customer_role_check",
      sql`(${table.role} = 'customer') = (${table.customerId} is not null)`,
    ),
  ],
);
