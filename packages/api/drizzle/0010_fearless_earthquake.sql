ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'cancellation_requested';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'cancelled_by_customer';