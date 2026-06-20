import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Audit log of committed product imports — one row per successful (non-dry-run)
 * batch. Records who ran it, the source file, and the outcome counts so admins
 * can see what changed and when. Tenant-scoped (RLS) — see the migration.
 */
export const productImports = pgTable(
  "product_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Global users table (no RLS) — keep the audit row if the user is deleted.
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    sourceFilename: text("source_filename"),
    total: integer("total").notNull(),
    inserted: integer("inserted").notNull(),
    updated: integer("updated").notNull(),
    categoriesCreated: integer("categories_created").notNull(),
    duplicatesInFile: integer("duplicates_in_file").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_imports_tenant_created_idx").on(table.tenantId, table.createdAt)],
);
