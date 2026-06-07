CREATE TYPE "public"."erp_status" AS ENUM('pending', 'transmitted');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'staff', 'customer');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('bottle', 'case', 'keg');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"address" text,
	"phone" text,
	"email" text NOT NULL,
	"notification_emails" text[] DEFAULT '{}' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"customer_id" uuid,
	"invited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"category_id" uuid,
	"description" text,
	"image_url" text,
	"sku" text,
	"erp_ref" text,
	"base_price" numeric(10, 2) NOT NULL,
	"unit" "product_unit" DEFAULT 'bottle' NOT NULL,
	"volume_ml" integer,
	"alcohol_pct" numeric(4, 1),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"address" text,
	"phone" text,
	"contact_person" text,
	"notes" text,
	"vat_id" text,
	"tax_office" text,
	"profession" text,
	"billing_address" text,
	"erp_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_brand_pricing" (
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "customer_brand_pricing_customer_id_brand_pk" PRIMARY KEY("customer_id","brand")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erp_status" "erp_status" DEFAULT 'pending' NOT NULL,
	"erp_mark" text,
	"erp_transmitted_at" timestamp with time zone,
	"erp_transmitted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"original_quantity" integer,
	"unit_price" numeric(10, 2) NOT NULL,
	"product_name" text NOT NULL,
	"status" "order_item_status" DEFAULT 'active' NOT NULL,
	"replaced_by_item_id" uuid
);
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_brand_pricing" ADD CONSTRAINT "customer_brand_pricing_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_brand_pricing" ADD CONSTRAINT "customer_brand_pricing_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_erp_transmitted_by_users_id_fk" FOREIGN KEY ("erp_transmitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_replaced_by_item_id_order_items_id_fk" FOREIGN KEY ("replaced_by_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_memberships_user_tenant_idx" ON "tenant_memberships" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_tenant_idx" ON "tenant_memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_customer_idx" ON "tenant_memberships" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_name_lower_idx" ON "categories" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_name_brand_idx" ON "products" USING btree ("tenant_id","name","brand");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_erp_ref_idx" ON "products" USING btree ("tenant_id","erp_ref") WHERE "products"."erp_ref" is not null;--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_erp_ref_idx" ON "customers" USING btree ("tenant_id","erp_ref") WHERE "customers"."erp_ref" is not null;--> statement-breakpoint
CREATE INDEX "customer_brand_pricing_tenant_idx" ON "customer_brand_pricing" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_created_idx" ON "orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
-- ============================================================================
-- Row-Level Security policies for multi-tenant isolation.
--
-- Part of the tracked migration graph so new tenant-scoped tables can't ship
-- with RLS silently missing. When adding a new tenant-scoped table: create a
-- custom migration (drizzle-kit generate --custom) with ENABLE/FORCE ROW
-- LEVEL SECURITY + a tenant_isolation policy for it.
--
-- NOTE: better-auth owns users, sessions, accounts, verifications — these
-- tables do NOT have RLS because better-auth queries them globally. Tenant
-- scoping for auth is enforced in application code (require-role middleware).
-- tenants and tenant_memberships are global by design.
--
-- RLS is only enforced for NON-superuser roles. The running server must
-- connect as the `kavanow_app` role (provisioned by migrate.ts), not the
-- bootstrap/owner role.
-- ============================================================================

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
