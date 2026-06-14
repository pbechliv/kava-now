CREATE TABLE "customer_assigned_users" (
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_assigned_users_customer_id_user_id_pk" PRIMARY KEY("customer_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN "notify_all_orders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_assigned_users" ADD CONSTRAINT "customer_assigned_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_assigned_users" ADD CONSTRAINT "customer_assigned_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_assigned_users" ADD CONSTRAINT "customer_assigned_users_customer_tenant_fk" FOREIGN KEY ("customer_id","tenant_id") REFERENCES "public"."customers"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_assigned_users_tenant_idx" ON "customer_assigned_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customer_assigned_users_user_idx" ON "customer_assigned_users" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "notification_emails";--> statement-breakpoint

-- ============================================================================
-- customer_assigned_users: RLS + backfill (hand-written; not in Drizzle's
-- snapshot — see drizzle/0000_init.sql for the pattern).
-- ============================================================================

-- Backfill BEFORE enabling RLS so the insert is never subject to a policy:
-- assign every existing customer to all of its tenant's owner-role users, so
-- pre-existing customers keep notifying someone after the scoping change.
INSERT INTO customer_assigned_users (tenant_id, customer_id, user_id)
SELECT c.tenant_id, c.id, m.user_id
FROM customers c
JOIN tenant_memberships m
  ON m.tenant_id = c.tenant_id AND m.role = 'owner'
ON CONFLICT DO NOTHING;--> statement-breakpoint

ALTER TABLE customer_assigned_users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_assigned_users FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Scoped by its own (denormalized) tenant_id, like customer_brand_pricing.
CREATE POLICY tenant_isolation_customer_assigned_users ON customer_assigned_users
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());