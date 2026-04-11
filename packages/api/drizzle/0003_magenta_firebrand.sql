ALTER TYPE "public"."user_role" ADD VALUE 'superadmin';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "kava_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ALTER COLUMN "kava_id" DROP NOT NULL;