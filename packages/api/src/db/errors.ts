/**
 * postgres-js throws PostgresError with `code` (SQLSTATE) and `constraint_name`.
 * Drizzle wraps it in DrizzleQueryError with the original on `.cause`, so we
 * unwrap one level. Duck-typed to avoid dragging the classes into handlers.
 */
export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
  const pgErr = unwrapPgError(err);
  if (!pgErr || pgErr.code !== "23505") return false;
  return constraintName ? pgErr.constraint_name === constraintName : true;
}

function unwrapPgError(err: unknown): { code?: string; constraint_name?: string } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: string; constraint_name?: string; cause?: unknown };
  if (e.code) return e;
  if (e.cause) return unwrapPgError(e.cause);
  return null;
}

export function isForeignKeyViolation(err: unknown, constraintName?: string): boolean {
  const pgErr = unwrapPgError(err);
  if (!pgErr || pgErr.code !== "23503") return false;
  return constraintName ? pgErr.constraint_name === constraintName : true;
}

export const FK_CONSTRAINTS = {
  orderCustomer: "orders_customer_tenant_fk",
  orderItemProduct: "order_items_product_id_products_id_fk",
} as const;

export const UNIQUE_CONSTRAINTS = {
  productErpRef: "products_tenant_erp_ref_idx",
  productNameBrand: "products_tenant_name_brand_idx",
  customerErpRef: "customers_tenant_erp_ref_idx",
  categoryName: "categories_tenant_name_lower_idx",
  tenantSlug: "tenants_slug_unique",
  userEmail: "users_email_lower_idx",
  tenantMembership: "tenant_memberships_user_tenant_idx",
} as const;
