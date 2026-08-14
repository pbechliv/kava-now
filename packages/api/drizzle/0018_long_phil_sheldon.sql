-- Paid indicator on orders (#218): an extra flag alongside the fulfillment
-- status, not one of its values. Existing rows default to 'unpaid'.
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_tenant_payment_idx" ON "orders" USING btree ("tenant_id","payment_status");--> statement-breakpoint
CREATE INDEX "orders_paid_by_idx" ON "orders" USING btree ("paid_by");