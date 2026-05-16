import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
import type { RegisterInput, PaginatedResponse } from "@kava-now/shared";

interface KavaListItem {
  id: string;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
}

interface CreateKavaResponse {
  success: boolean;
  slug: string;
  hasPassword: boolean;
}

interface SuperAdminKavasFilters {
  page?: number;
  pageSize?: number;
}

export function useSuperAdminKavas(filters?: SuperAdminKavasFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/api/superadmin/kavas${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["superadmin", "kavas", filters],
    queryFn: () => api.get<PaginatedResponse<KavaListItem>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useCreateKava() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterInput) =>
      api.post<CreateKavaResponse>("/api/superadmin/kavas", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "kavas"] });
    },
  });
}

export function useDeleteKava() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/superadmin/kavas/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "kavas"] });
    },
  });
}
