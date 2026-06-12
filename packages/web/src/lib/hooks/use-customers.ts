import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
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
  const path = withQuery("/admin/customers", filters);

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
    // userInviteError is set when the customer row was created but the linked
    // customer-user invite failed (e.g. email already used in this tenant).
    mutationFn: (data: CreateCustomerInput) =>
      tApi.post<Customer & { userInviteError: string | null }>("/admin/customers", data),
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
