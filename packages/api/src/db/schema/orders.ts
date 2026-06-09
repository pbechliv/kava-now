import { pgTable, uuid, text, timestamp, index, foreignKey } from "drizzle-orm/pg-core";
import { erpStatusEnum, orderStatusEnum } from "./enums";
import { tenants } from "./tenants";
import { customers } from "./customers";
import { users } from "./users";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // FK is composite (see table config below): "no action" (not cascade)
    // because orders are financial/audit history — deleting a customer must
    // never destroy them.
    customerId: uuid("customer_id").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    erpStatus: erpStatusEnum("erp_status").notNull().default("pending"),
    erpMark: text("erp_mark"),
    erpTransmittedAt: timestamp("erp_transmitted_at", { withTimezone: true }),
    erpTransmittedBy: uuid("erp_transmitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // Orders list / dashboard scan by tenant, newest first.
    index("orders_tenant_created_idx").on(table.tenantId, table.createdAt),
    // Customer order history.
    index("orders_customer_idx").on(table.customerId),
    // Composite: the customer must belong to the same tenant as the order.
    // NO ACTION, and made DEFERRABLE INITIALLY DEFERRED by hand in the
    // migration (the schema API can't express it): tenant deletion cascades
    // customers/orders in one statement and only a commit-time check
    // tolerates that; direct deletes force it with SET CONSTRAINTS IMMEDIATE.
    foreignKey({
      name: "orders_customer_tenant_fk",
      columns: [table.customerId, table.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }).onDelete("no action"),
  ],
);
