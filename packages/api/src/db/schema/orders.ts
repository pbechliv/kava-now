import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
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
    // "no action" (not cascade): orders are financial/audit history — deleting
    // a customer must never destroy them. The constraint is additionally made
    // DEFERRABLE INITIALLY DEFERRED by hand in drizzle/0001 (the schema API
    // can't express it) so tenant-purge cascades pass; direct deletes force
    // the check with SET CONSTRAINTS ... IMMEDIATE.
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "no action" }),
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
  ],
);
