-- Row-Level Security policies for multi-tenant isolation
-- Every tenant-scoped data table is filtered by the current tenant, read from
-- the `app.current_tenant_id` session variable set (transaction-locally) by
-- `runWithTenant` in the application.
-- This script is idempotent (safe to run multiple times).
--
-- NOTE: better-auth owns users, sessions, accounts, verifications — these tables
-- do NOT have RLS because better-auth queries them globally (by session token,
-- by user id). Tenant scoping for auth is enforced in application code via
-- require-role / require-auth middleware, which looks up `tenant_memberships`
-- to verify the authenticated user belongs to the tenant resolved from the URL.
--
-- IMPORTANT: RLS is only enforced for NON-superuser roles. The running server
-- must connect as the `kavanow_app` role (provisioned by migrate.ts), not the
-- bootstrap/owner role.

-- Helper: the current tenant as a uuid, or NULL when unset.
-- A custom GUC reverts to '' (empty string), not NULL, after a transaction-local
-- SET is committed on a pooled connection, so `current_setting(...)::uuid` would
-- raise "invalid input syntax for type uuid". `nullif(..., '')` maps both the
-- never-set (NULL) and reverted ('') states to NULL → the policy matches no rows
-- (fail-safe) instead of erroring.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid $$;

-- Enable RLS on tenant-scoped data tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_brand_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner (so a non-superuser owner can't bypass it).
-- Superusers always bypass RLS — the app must not connect as one.
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_brand_pricing FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS tenant_isolation_categories ON categories;
DROP POLICY IF EXISTS tenant_isolation_products ON products;
DROP POLICY IF EXISTS tenant_isolation_customers ON customers;
DROP POLICY IF EXISTS tenant_isolation_customer_brand_pricing ON customer_brand_pricing;
DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items;

-- Categories: scoped by tenant_id
CREATE POLICY tenant_isolation_categories ON categories
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Products: scoped by tenant_id
CREATE POLICY tenant_isolation_products ON products
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Customers: scoped by tenant_id
CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Customer Brand Pricing: scoped via customer's tenant_id
CREATE POLICY tenant_isolation_customer_brand_pricing ON customer_brand_pricing
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers WHERE tenant_id = current_tenant_id()
    )
  );

-- Orders: scoped by tenant_id
CREATE POLICY tenant_isolation_orders ON orders
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Order Items: scoped via order's tenant_id
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

-- Note: tenants, sessions, accounts, verifications, users, and tenant_memberships
-- do NOT have RLS:
-- - tenants: needed for tenant lookup before RLS var is set
-- - sessions/accounts/verifications: owned by better-auth, queried globally by token
-- - users: global by design (one user can belong to multiple tenants)
-- - tenant_memberships: lookup table consulted by application middleware
