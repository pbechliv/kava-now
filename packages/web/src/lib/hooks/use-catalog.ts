import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type { PaginatedResponse } from "@kava-now/shared";
import type { CatalogProduct } from "../store/cart";

interface CatalogFilters {
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogCategory {
  id: string;
  name: string;
  sortOrder: number;
}

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
