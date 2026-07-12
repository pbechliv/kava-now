-- Human-friendly per-tenant sequential order numbers (#161).
ALTER TABLE "tenants" ADD COLUMN "order_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Add nullable first, backfill existing rows, then enforce NOT NULL — a bare
-- `ADD COLUMN ... NOT NULL` (no default) fails on any tenant with orders.
ALTER TABLE "orders" ADD COLUMN "order_number" integer;--> statement-breakpoint

-- Backfill: number each tenant's existing orders 1..N, oldest first (id breaks
-- created_at ties deterministically).
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn
  FROM orders
)
UPDATE orders o SET order_number = numbered.rn
FROM numbered WHERE numbered.id = o.id;--> statement-breakpoint

-- Seed each tenant's counter to its current max so newly created orders
-- continue the sequence without colliding with backfilled numbers.
UPDATE tenants t SET order_counter = COALESCE(
  (SELECT max(order_number) FROM orders o WHERE o.tenant_id = t.id), 0
);--> statement-breakpoint

-- The backfill UPDATE queues deferred checks for the DEFERRABLE INITIALLY
-- DEFERRED "orders_customer_tenant_fk". Drizzle runs the whole migration in one
-- transaction, so those checks stay pending — and `ALTER TABLE ... SET NOT NULL`
-- refuses while a table has pending trigger events. Force them now.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint

ALTER TABLE "orders" ALTER COLUMN "order_number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_number_idx" ON "orders" USING btree ("tenant_id","order_number");
