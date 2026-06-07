ALTER TABLE "customer_brand_pricing" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
UPDATE "customer_brand_pricing" cbp SET "tenant_id" = c."tenant_id" FROM "customers" c WHERE cbp."customer_id" = c."id";--> statement-breakpoint
ALTER TABLE "customer_brand_pricing" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_brand_pricing" ADD CONSTRAINT "customer_brand_pricing_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "customer_brand_pricing_tenant_idx" ON "customer_brand_pricing" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_created_idx" ON "orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");