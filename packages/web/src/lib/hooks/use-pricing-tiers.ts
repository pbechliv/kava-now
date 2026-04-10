import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  PricingTier,
  CreatePricingTierInput,
  UpdatePricingTierInput,
} from "@kava-now/shared";

interface PricingTierWithCount extends PricingTier {
  customerCount: number;
}

export function usePricingTiers() {
  return useQuery({
    queryKey: ["admin", "pricing-tiers"],
    queryFn: () => api.get<PricingTierWithCount[]>("/api/admin/pricing-tiers"),
  });
}

export function useCreatePricingTier() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePricingTierInput) =>
      api.post<PricingTier>("/api/admin/pricing-tiers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-tiers"] });
    },
  });
}

export function useUpdatePricingTier() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdatePricingTierInput;
    }) => api.put<PricingTier>(`/api/admin/pricing-tiers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-tiers"] });
    },
  });
}

export function useDeletePricingTier() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/pricing-tiers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-tiers"] });
    },
  });
}
