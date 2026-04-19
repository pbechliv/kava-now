-- Row-Level Security policies for multi-tenant isolation
-- Every tenant-scoped table uses current_setting('app.current_kava_id') to filter rows
-- This script is idempotent (safe to run multiple times)

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_brand_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (superuser bypass still works)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_brand_pricing FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE magic_link_tokens FORCE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS tenant_isolation_users ON users;
DROP POLICY IF EXISTS tenant_isolation_categories ON categories;
DROP POLICY IF EXISTS tenant_isolation_products ON products;
DROP POLICY IF EXISTS tenant_isolation_customers ON customers;
DROP POLICY IF EXISTS tenant_isolation_customer_brand_pricing ON customer_brand_pricing;
DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items;
DROP POLICY IF EXISTS tenant_isolation_magic_link_tokens ON magic_link_tokens;

-- Users: scoped by kava_id
CREATE POLICY tenant_isolation_users ON users
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Categories: scoped by kava_id
CREATE POLICY tenant_isolation_categories ON categories
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Products: scoped by kava_id
CREATE POLICY tenant_isolation_products ON products
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Customers: scoped by kava_id
CREATE POLICY tenant_isolation_customers ON customers
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Customer Brand Pricing: scoped via customer's kava_id
CREATE POLICY tenant_isolation_customer_brand_pricing ON customer_brand_pricing
  USING (
    customer_id IN (
      SELECT id FROM customers
      WHERE kava_id = current_setting('app.current_kava_id', true)::uuid
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers
      WHERE kava_id = current_setting('app.current_kava_id', true)::uuid
    )
  );

-- Orders: scoped by kava_id
CREATE POLICY tenant_isolation_orders ON orders
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Order Items: scoped via order's kava_id
CREATE POLICY tenant_isolation_order_items ON order_items
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE kava_id = current_setting('app.current_kava_id', true)::uuid
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders
      WHERE kava_id = current_setting('app.current_kava_id', true)::uuid
    )
  );

-- Magic Link Tokens: scoped by kava_id
CREATE POLICY tenant_isolation_magic_link_tokens ON magic_link_tokens
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Note: kavas, sessions, and seed_products do NOT have RLS
-- - kavas: needed for tenant lookup before RLS var is set
-- - sessions: keyed by user_id, not kava_id (Lucia manages these)
-- - seed_products: platform-wide catalog, shared across all tenants
