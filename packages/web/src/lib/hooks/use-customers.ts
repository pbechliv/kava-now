import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  PaginatedResponse,
} from "@kava-now/shared";

interface CustomerFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useCustomers(filters?: CustomerFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/admin/customers${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", slug, "customers", filters],
    queryFn: () => tApi.get<PaginatedResponse<Customer>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "customers", id],
    queryFn: () => tApi.get<Customer>(`/admin/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCustomerInput) => tApi.post<Customer>("/admin/customers", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerInput }) =>
      tApi.put<Customer>(`/admin/customers/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "customers"] });
    },
  });
}

export function useDeleteCustomer() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tApi.delete(`/admin/customers/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "customers"] });
    },
  });
}
