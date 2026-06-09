import { pgTable, uuid, text, numeric, primaryKey, index, foreignKey } from "drizzle-orm/pg-core";
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
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.brand] }),
    index("customer_brand_pricing_tenant_idx").on(table.tenantId),
    foreignKey({
      name: "customer_brand_pricing_customer_tenant_fk",
      columns: [table.customerId, table.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }).onDelete("cascade"),
  ],
);
