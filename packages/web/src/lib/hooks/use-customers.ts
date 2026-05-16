import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
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
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/api/admin/customers${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "customers", filters],
    queryFn: () => api.get<PaginatedResponse<Customer>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "customers", id],
    queryFn: () => api.get<Customer>(`/api/admin/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCustomerInput) => api.post<Customer>("/api/admin/customers", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerInput }) =>
      api.put<Customer>(`/api/admin/customers/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/customers/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}
