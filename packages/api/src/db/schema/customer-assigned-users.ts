import { pgTable, uuid, timestamp, primaryKey, index, foreignKey } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { customers } from "./customers";
import { users } from "./users";

/**
 * Staff/owner users responsible for a customer account. When that customer
 * places an order, its assigned users (plus anyone opted into all-order
 * notifications) receive the new-order email + push. Distinct from
 * customer-role memberships, which are the customer's own login users.
 */
export const customerAssignedUsers = pgTable(
  "customer_assigned_users",
  {
    // Denormalized from customers.tenant_id so the RLS policy and direct
    // queries can scope by tenant without joining through customers. The
    // composite FK below makes the denormalization DB-verified.
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.userId] }),
    index("customer_assigned_users_tenant_idx").on(table.tenantId),
    index("customer_assigned_users_user_idx").on(table.userId),
    // Composite FK: the linked customer must belong to the SAME tenant as the
    // denormalized tenant_id — RLS scopes by it, so a cross-tenant link would
    // be an isolation defect.
    foreignKey({
      name: "customer_assigned_users_customer_tenant_fk",
      columns: [table.customerId, table.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }).onDelete("cascade"),
  ],
);
