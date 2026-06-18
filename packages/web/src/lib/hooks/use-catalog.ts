import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  CatalogProduct,
  CatalogCategoryChip,
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
