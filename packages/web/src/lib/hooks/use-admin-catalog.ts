import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  CatalogProduct,
  CatalogCategoryChip,
  CatalogSearch,
  PaginatedResponse,
} from "@kava-now/shared";

// Admin-side catalog for the staff create-order flow (#159). Prices resolve
// against an explicit customerId (staff have no customer profile of their own).

/** Category chips — independent of the customer/product filter. */
export function useAdminCatalogCategories() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "catalog-categories"],
    queryFn: () => tApi.get<CatalogCategoryChip[]>("/admin/catalog/categories"),
  });
}

type AdminCatalogFilters = CatalogSearch & { pageSize?: number };

/**
 * Products with the price the given customer would pay. Disabled until a
 * customer is picked — no customerId means no meaningful pricing.
 */
export function useAdminCatalog(customerId: string | undefined, filters?: AdminCatalogFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/admin/catalog", { customerId, ...filters });

  return useQuery({
    queryKey: ["admin", slug, "catalog", customerId, filters],
    queryFn: () => tApi.get<PaginatedResponse<CatalogProduct>>(path),
    enabled: !!customerId,
    placeholderData: keepPreviousData,
  });
}
