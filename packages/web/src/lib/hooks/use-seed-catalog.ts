import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
import type { SeedProduct, PaginatedResponse } from "@kava-now/shared";

interface SeedCatalogFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useSeedCatalog(filters?: SeedCatalogFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/api/admin/seed-catalog${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "seed-catalog", filters],
    queryFn: () => api.get<PaginatedResponse<SeedProduct>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useImportSeedProducts() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (seedProductIds: string[]) =>
      api.post<{ imported: number }>("/api/admin/seed-catalog/import", {
        seedProductIds,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}
