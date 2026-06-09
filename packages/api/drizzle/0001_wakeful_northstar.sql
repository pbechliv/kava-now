ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_products_id_fk";
--> statement-breakpoint
-- NO ACTION (not cascade): orders and their line items are financial/audit
-- history — deleting a customer or product must never destroy them.
-- DEFERRABLE INITIALLY DEFERRED (hand-written; drizzle's schema API cannot
-- express deferrability): tenant deletion cascades to customers, orders,
-- products and order_items in one statement, and Postgres's trigger queue can
-- fire the products→order_items check before the orders→order_items cascade
-- has run — only a commit-time check tolerates that. Routes that delete
-- customers/products directly run SET CONSTRAINTS ... IMMEDIATE inside a
-- savepoint to get a catchable statement-time violation instead.
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
