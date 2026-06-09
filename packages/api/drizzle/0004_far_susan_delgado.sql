ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
-- Normalize existing rows before the case-insensitive unique index lands.
-- If two rows differ only by case this fails loudly — resolve by hand (the
-- pre-migrate pg_dump is the restore point).
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));
