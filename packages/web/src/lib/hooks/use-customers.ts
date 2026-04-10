import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
} from "@kava-now/shared";

interface CustomerWithTier extends Customer {
  pricingTierName: string | null;
}

export function useCustomers(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const qs = params.toString();
  const path = `/api/admin/customers${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "customers", search],
    queryFn: () => api.get<CustomerWithTier[]>(path),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "customers", id],
    queryFn: () => api.get<CustomerWithTier>(`/api/admin/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCustomerInput) =>
      api.post<Customer>("/api/admin/customers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerInput }) =>
      api.put<Customer>(`/api/admin/customers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
  });
}
