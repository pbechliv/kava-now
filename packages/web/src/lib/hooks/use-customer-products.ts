import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Product, AssignProductsInput } from "@kava-now/shared";

export interface CustomerProductRow {
  product: Product;
  assigned: boolean;
  customPrice: number | null;
  resolvedPrice: number;
}

export function useCustomerProducts(customerId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "customers", customerId, "products"],
    queryFn: () =>
      api.get<CustomerProductRow[]>(
        `/api/admin/customers/${customerId}/products`,
      ),
    enabled: !!customerId,
  });
}

export function useUpdateCustomerProducts(customerId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: AssignProductsInput) =>
      api.put(`/api/admin/customers/${customerId}/products`, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "customers", customerId, "products"],
      });
    },
  });
}
