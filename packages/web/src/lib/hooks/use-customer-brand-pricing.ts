import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { UpdateCustomerBrandPricingInput } from "@kava-now/shared";

export interface BrandPricingRow {
  brand: string;
  discountPct: number;
}

export function useCustomerBrandPricing(customerId: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "customers", customerId, "brand-pricing"],
    queryFn: () => tApi.get<BrandPricingRow[]>(`/admin/customers/${customerId}/brand-pricing`),
    enabled: !!customerId,
  });
}

export function useUpdateCustomerBrandPricing(customerId: string) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateCustomerBrandPricingInput) =>
      tApi.put(`/admin/customers/${customerId}/brand-pricing`, data),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["admin", slug, "customers", customerId, "brand-pricing"],
      });
    },
  });
}

export function useBrands() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "brands"],
    queryFn: () => tApi.get<string[]>("/admin/customers/brands"),
  });
}
