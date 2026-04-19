-- Restructure pricing: per-customer-brand discounts instead of named tiers
-- 1. Create new customer_brand_pricing table
-- 2. Migrate existing tier-based pricing data
-- 3. Drop old tables/columns

-- Step 1: Create customer_brand_pricing table
CREATE TABLE "customer_brand_pricing" (
	"customer_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "customer_brand_pricing_customer_id_brand_pk" PRIMARY KEY("customer_id","brand")
);--> statement-breakpoint

-- Step 2: Migrate data — for each customer that had a pricing tier,
-- create brand pricing entries for every distinct brand in their kava's products
INSERT INTO customer_brand_pricing (customer_id, brand, discount_pct)
SELECT c.id, p.brand, pt.discount_pct
FROM customers c
JOIN pricing_tiers pt ON c.pricing_tier_id = pt.id
CROSS JOIN (
  SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND active = true
) p
WHERE c.pricing_tier_id IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Step 3: Make products.brand NOT NULL (set any NULL brands to the product name first)
UPDATE products SET brand = name WHERE brand IS NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "brand" SET NOT NULL;--> statement-breakpoint

-- Step 4: Drop old foreign key and column from customers
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_pricing_tier_id_pricing_tiers_id_fk";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN IF EXISTS "pricing_tier_id";--> statement-breakpoint

-- Step 5: Drop old tables
DROP TABLE IF EXISTS "customer_products";--> statement-breakpoint
DROP TABLE IF EXISTS "pricing_tiers";--> statement-breakpoint

-- Step 6: Add foreign key for new table
ALTER TABLE "customer_brand_pricing" ADD CONSTRAINT "customer_brand_pricing_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
