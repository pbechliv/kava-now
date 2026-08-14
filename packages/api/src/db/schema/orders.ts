import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { erpStatusEnum, orderOriginEnum, orderStatusEnum, paymentStatusEnum } from "./enums";
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
    // Human-friendly per-tenant sequential order number (#161), shown in all
    // lists/details/notifications instead of the UUID. Allocated from the
    // tenant's `orderCounter` inside the order-creation transaction; unique
    // per tenant (see the unique index below).
    orderNumber: integer("order_number").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    // Intake channel (#159): `portal` (customer self-service) or `manual` (staff
    // created it on the customer's behalf). Defaults to `portal` so existing
    // rows and customer-portal orders need no explicit value.
    origin: orderOriginEnum("origin").notNull().default("portal"),
    // Customer-authored comment, set at order creation. Visible to the customer.
    notes: text("notes"),
    // Staff/owner-only note. NEVER returned by any customer-facing endpoint.
    internalNotes: text("internal_notes"),
    // Structured B2B checkout metadata (#175). requestedDeliveryDate is a plain
    // calendar date (no time/tz) — "deliver Thursday", not an instant. Both are
    // customer-set at checkout and visible on the admin order detail.
    requestedDeliveryDate: date("requested_delivery_date"),
    poReference: text("po_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    erpStatus: erpStatusEnum("erp_status").notNull().default("pending"),
    erpMark: text("erp_mark"),
    erpTransmittedAt: timestamp("erp_transmitted_at", { withTimezone: true }),
    erpTransmittedBy: uuid("erp_transmitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    // A transmitted MARK is otherwise hard-locked; these record a privileged
    // (owner/superadmin) correction of a mistyped MARK — who/when/why. NULL
    // until a correction happens. The original erpTransmittedAt/By are left
    // intact so the initial transmission audit survives the correction.
    erpMarkCorrectedAt: timestamp("erp_mark_corrected_at", { withTimezone: true }),
    erpMarkCorrectedBy: uuid("erp_mark_corrected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    erpMarkCorrectionReason: text("erp_mark_correction_reason"),
    // Payment indicator (#218) — orthogonal to both `status` and `erpStatus`.
    // Reversible, unlike the ERP MARK: clearing it back to 'unpaid' nulls the
    // stamp below, so paidAt/paidBy always describe the current 'paid' state
    // rather than a stale one.
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    // Orders list / dashboard scan by tenant, newest first.
    index("orders_tenant_created_idx").on(table.tenantId, table.createdAt),
    // Per-tenant sequential order number — unique within a tenant.
    uniqueIndex("orders_tenant_number_idx").on(table.tenantId, table.orderNumber),
    // Customer order history.
    index("orders_customer_idx").on(table.customerId),
    // The per-customer outstanding-balance roll-up on the customers list
    // (#218) scans a tenant's unpaid orders and groups them by customer.
    index("orders_tenant_payment_idx").on(table.tenantId, table.paymentStatus),
    // SET NULL on user deletion scans these FKs.
    index("orders_erp_transmitted_by_idx").on(table.erpTransmittedBy),
    index("orders_erp_mark_corrected_by_idx").on(table.erpMarkCorrectedBy),
    index("orders_paid_by_idx").on(table.paidBy),
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
