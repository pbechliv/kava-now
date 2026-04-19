import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { UpdateCustomerBrandPricingInput } from "@kava-now/shared";

export interface BrandPricingRow {
  brand: string;
  discountPct: number;
}

export function useCustomerBrandPricing(customerId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "customers", customerId, "brand-pricing"],
    queryFn: () =>
      api.get<BrandPricingRow[]>(
        `/api/admin/customers/${customerId}/brand-pricing`,
      ),
    enabled: !!customerId,
  });
}

export function useUpdateCustomerBrandPricing(customerId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateCustomerBrandPricingInput) =>
      api.put(`/api/admin/customers/${customerId}/brand-pricing`, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "customers", customerId, "brand-pricing"],
      });
    },
  });
}

export function useBrands() {
  return useQuery({
    queryKey: ["admin", "brands"],
    queryFn: () => api.get<string[]>("/api/admin/customers/brands"),
  });
}
