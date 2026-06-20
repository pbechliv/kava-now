CREATE TABLE "product_import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by_id" uuid,
	"source_filename" text,
	"total" integer NOT NULL,
	"inserted" integer NOT NULL,
	"updated" integer NOT NULL,
	"categories_created" integer NOT NULL,
	"duplicates_in_file" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_import_mappings" ADD CONSTRAINT "product_import_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_mappings" ADD CONSTRAINT "product_import_mappings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_imports" ADD CONSTRAINT "product_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_imports" ADD CONSTRAINT "product_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_import_mappings_tenant_name_lower_idx" ON "product_import_mappings" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "product_imports_tenant_created_idx" ON "product_imports" USING btree ("tenant_id","created_at");--> statement-breakpoint

-- ============================================================================
-- product_import_mappings + product_imports: RLS (hand-written; not in
-- Drizzle's snapshot — see drizzle/0000_init.sql for the pattern). Both are
-- scoped by their own tenant_id, like products/categories.
-- ============================================================================
ALTER TABLE product_import_mappings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_import_mappings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_imports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_imports FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation_product_import_mappings ON product_import_mappings
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY tenant_isolation_product_imports ON product_imports
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());