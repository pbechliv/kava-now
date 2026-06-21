import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  CatalogProduct,
  CatalogCategoryChip,
  CatalogPriceResolution,
  CatalogSearch,
  PaginatedResponse,
} from "@kava-now/shared";

type CatalogFilters = CatalogSearch & { pageSize?: number };

// Local alias for the historical name used by the catalog page.
export type CatalogCategory = CatalogCategoryChip;

/** Category chips — independent of the paginated/filtered product list. */
export function useCatalogCategories() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["customer", slug, "catalog-categories"],
    queryFn: () => tApi.get<CatalogCategory[]>("/customer/catalog/categories"),
  });
}

export function useCatalog(filters?: CatalogFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/customer/catalog", filters);

  return useQuery({
    queryKey: ["customer", slug, "catalog", filters],
    queryFn: () => tApi.get<PaginatedResponse<CatalogProduct>>(path),
    placeholderData: keepPreviousData,
  });
}

/**
 * Resolve the *current* price + availability for the cart's products, so the
 * cart can reconcile its persisted (possibly stale) prices against server truth
 * before checkout. Keyed by the sorted unique ids — quantity edits don't refetch.
 */
export function useResolveCartPrices(productIds: string[]) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const ids = [...new Set(productIds)].sort();

  return useQuery({
    queryKey: ["customer", slug, "cart-resolve", ids],
    queryFn: () =>
      tApi.post<CatalogPriceResolution[]>("/customer/catalog/resolve", { productIds: ids }),
    enabled: ids.length > 0,
  });
}
