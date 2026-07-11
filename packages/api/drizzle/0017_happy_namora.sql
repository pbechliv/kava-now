CREATE TYPE "public"."order_origin" AS ENUM('portal', 'phone');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "origin" "order_origin" DEFAULT 'portal' NOT NULL;