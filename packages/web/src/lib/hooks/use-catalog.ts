import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { PaginatedResponse } from "@kava-now/shared";
import type { CatalogProduct } from "../store/cart";

interface CatalogFilters {
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useCatalog(filters?: CatalogFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/customer/catalog${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["customer", slug, "catalog", filters],
    queryFn: () => tApi.get<PaginatedResponse<CatalogProduct>>(path),
    placeholderData: keepPreviousData,
  });
}
