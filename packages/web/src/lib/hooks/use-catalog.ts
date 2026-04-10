import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { CatalogProduct } from "../store/cart";

interface CatalogFilters {
  categoryId?: string;
  search?: string;
}

export function useCatalog(filters?: CatalogFilters) {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.search) params.set("search", filters.search);

  const qs = params.toString();
  const path = `/api/customer/catalog${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["customer", "catalog", filters],
    queryFn: () => api.get<CatalogProduct[]>(path),
  });
}
