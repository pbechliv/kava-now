ALTER TABLE "orders" ADD COLUMN "erp_mark_corrected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "erp_mark_corrected_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "erp_mark_correction_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_erp_mark_corrected_by_users_id_fk" FOREIGN KEY ("erp_mark_corrected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_erp_mark_corrected_by_idx" ON "orders" USING btree ("erp_mark_corrected_by");