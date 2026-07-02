import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  primaryKey,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { customers } from "./customers";

export const customerBrandPricing = pgTable(
  "customer_brand_pricing",
  {
    // Denormalized from customers.tenant_id so the RLS policy and direct
    // queries can scope by tenant without joining through customers. The
    // composite FK below makes the denormalization DB-verified.
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    brand: text("brand").notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.brand] }),
    index("customer_brand_pricing_tenant_idx").on(table.tenantId),
    foreignKey({
      name: "customer_brand_pricing_customer_tenant_fk",
      columns: [table.customerId, table.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }).onDelete("cascade"),
    // A discount outside 0–100 miscomputes every price for that customer/brand —
    // same bounds as the shared schema, enforced at the DB as the backstop.
    check(
      "customer_brand_pricing_discount_pct_check",
      sql`${table.discountPct} >= 0 and ${table.discountPct} <= 100`,
    ),
  ],
);
