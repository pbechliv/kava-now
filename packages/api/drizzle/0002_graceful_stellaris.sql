ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD COLUMN "purpose" text DEFAULT 'login' NOT NULL;