-- Custom migration: Row-Level Security policies for multi-tenant isolation.
--
-- Previously applied out-of-band by migrate.ts from src/db/rls.sql; now part
-- of the tracked migration graph so new tenant-scoped tables can't ship with
-- RLS silently missing. All statements are idempotent, so re-running on a
-- database that already had the out-of-band policies is safe.
--
-- When adding a new tenant-scoped table: create a new custom migration with
-- ENABLE/FORCE ROW LEVEL SECURITY + a tenant_isolation policy for it.
--
-- NOTE: better-auth owns users, sessions, accounts, verifications — these
-- tables do NOT have RLS because better-auth queries them globally. Tenant
-- scoping for auth is enforced in application code (require-role middleware).
-- tenants and tenant_memberships are global by design.
--
-- RLS is only enforced for NON-superuser roles. The running server must
-- connect as the `kavanow_app` role (provisioned by migrate.ts), not the
-- bootstrap/owner role.

-- Helper: the current tenant as a uuid, or NULL when unset.
-- A custom GUC reverts to '' (empty string), not NULL, after a transaction-local
-- SET is committed on a pooled connection, so `current_setting(...)::uuid` would
-- raise "invalid input syntax for type uuid". `nullif(..., '')` maps both the
-- never-set (NULL) and reverted ('') states to NULL → the policy matches no rows
-- (fail-safe) instead of erroring.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid $$;--> statement-breakpoint

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_brand_pricing ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Force RLS even for the table owner (so a non-superuser owner can't bypass it).
-- Superusers always bypass RLS — the app must not connect as one.
ALTER TABLE categories FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE products FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customers FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_brand_pricing FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE orders FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation_categories ON categories;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_products ON products;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_customers ON customers;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_customer_brand_pricing ON customer_brand_pricing;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_orders ON orders;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items;--> statement-breakpoint

CREATE POLICY tenant_isolation_categories ON categories
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY tenant_isolation_products ON products
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

-- Customer Brand Pricing: scoped by its own (denormalized) tenant_id.
CREATE POLICY tenant_isolation_customer_brand_pricing ON customer_brand_pricing
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY tenant_isolation_orders ON orders
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

-- Order Items: scoped via order's tenant_id.
CREATE POLICY tenant_isolation_order_items ON order_items
  USING (
    order_id IN (
      SELECT id FROM orders WHERE tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE tenant_id = current_tenant_id()
    )
  );
