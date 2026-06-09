ALTER TABLE "tenant_memberships" DROP CONSTRAINT "tenant_memberships_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_brand_pricing" DROP CONSTRAINT "customer_brand_pricing_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_customers_id_fk";
--> statement-breakpoint
-- Hand-reordered: the composite FKs below need this unique index to exist.
CREATE UNIQUE INDEX "customers_id_tenant_idx" ON "customers" USING btree ("id","tenant_id");--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_customer_tenant_fk" FOREIGN KEY ("customer_id","tenant_id") REFERENCES "public"."customers"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_brand_pricing" ADD CONSTRAINT "customer_brand_pricing_customer_tenant_fk" FOREIGN KEY ("customer_id","tenant_id") REFERENCES "public"."customers"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- DEFERRABLE INITIALLY DEFERRED by hand (drizzle can't express it) — same
-- reasoning as drizzle/0001: tenant-purge cascades only pass a commit-time
-- check; direct deletes force it with SET CONSTRAINTS ... IMMEDIATE.
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_tenant_fk" FOREIGN KEY ("customer_id","tenant_id") REFERENCES "public"."customers"("id","tenant_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_customer_role_check" CHECK (("tenant_memberships"."role" = 'customer') = ("tenant_memberships"."customer_id" is not null));
