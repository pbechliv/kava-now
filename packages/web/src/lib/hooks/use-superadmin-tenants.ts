import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
import { withQuery } from "../utils";
import type { RegisterInput, PaginatedResponse } from "@kava-now/shared";

interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
}

interface CreateTenantResponse {
  success: boolean;
  slug: string;
  hasPassword: boolean;
}

interface SuperAdminTenantsFilters {
  page?: number;
  pageSize?: number;
}

export function useSuperAdminTenants(filters?: SuperAdminTenantsFilters) {
  const path = withQuery("/api/superadmin/tenants", filters);

  return useQuery({
    queryKey: ["superadmin", "tenants", filters],
    queryFn: () => api.get<PaginatedResponse<TenantListItem>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterInput) =>
      api.post<CreateTenantResponse>("/api/superadmin/tenants", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "tenants"] });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/superadmin/tenants/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "tenants"] });
    },
  });
}
