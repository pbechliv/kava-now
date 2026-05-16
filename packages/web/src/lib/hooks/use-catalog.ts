import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
import type { PaginatedResponse } from "@kava-now/shared";
import type { CatalogProduct } from "../store/cart";

interface CatalogFilters {
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useCatalog(filters?: CatalogFilters) {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/api/customer/catalog${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["customer", "catalog", filters],
    queryFn: () => api.get<PaginatedResponse<CatalogProduct>>(path),
    placeholderData: keepPreviousData,
  });
}
