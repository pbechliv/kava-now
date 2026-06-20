import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ImportColumnMapping } from "@kava-now/shared";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Named, tenant-shared column-mapping templates for the product import flow.
 * Replaces the previous per-browser localStorage persistence so a saved mapping
 * is reusable across staff and devices. Tenant-scoped (RLS) — see the migration.
 */
export const productImportMappings = pgTable(
  "product_import_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mapping: jsonb("mapping").$type<ImportColumnMapping>().notNull(),
    // Who saved it. Global users table (no RLS) — set null if the user is gone.
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One template name per tenant (case-insensitive) — re-saving updates it.
    uniqueIndex("product_import_mappings_tenant_name_lower_idx").on(
      table.tenantId,
      sql`lower(${table.name})`,
    ),
  ],
);
