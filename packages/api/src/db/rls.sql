-- Row-Level Security policies for multi-tenant isolation
-- Every tenant-scoped table uses current_setting('app.current_kava_id') to filter rows

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (superuser bypass still works)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE pricing_tiers FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_products FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE magic_link_tokens FORCE ROW LEVEL SECURITY;

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

-- Pricing Tiers: scoped by kava_id
CREATE POLICY tenant_isolation_pricing_tiers ON pricing_tiers
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Customers: scoped by kava_id
CREATE POLICY tenant_isolation_customers ON customers
  USING (kava_id = current_setting('app.current_kava_id', true)::uuid)
  WITH CHECK (kava_id = current_setting('app.current_kava_id', true)::uuid);

-- Customer Products: scoped via customer's kava_id
CREATE POLICY tenant_isolation_customer_products ON customer_products
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
