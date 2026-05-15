import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { SeedProduct } from "@kava-now/shared";

export function useSeedCatalog(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const qs = params.toString();
  const path = `/api/admin/seed-catalog${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "seed-catalog", search],
    queryFn: () => api.get<SeedProduct[]>(path),
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
