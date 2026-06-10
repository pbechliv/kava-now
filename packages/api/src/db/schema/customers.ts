import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    address: text("address"),
    phone: text("phone"),
    contactPerson: text("contact_person"),
    notes: text("notes"),
    vatId: text("vat_id"),
    taxOffice: text("tax_office"),
    profession: text("profession"),
    billingAddress: text("billing_address"),
    erpRef: text("erp_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("customers_tenant_erp_ref_idx")
      .on(table.tenantId, table.erpRef)
      .where(sql`${table.erpRef} is not null`),
    // FK target for the composite (customer_id, tenant_id) references on
    // orders / memberships / brand pricing — those make a cross-tenant
    // customer link unrepresentable at the DB level.
    uniqueIndex("customers_id_tenant_idx").on(table.id, table.tenantId),
  ],
);
