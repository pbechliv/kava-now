import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { Customer } from "@kava-now/shared";

// The profile endpoint whitelists customer-facing columns — internal admin
// notes, billing/ERP fields, and tenantId are never returned.
export type CustomerProfile = Pick<
  Customer,
  "id" | "name" | "email" | "address" | "phone" | "contactPerson"
>;

export function useProfile() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["customer", slug, "profile"],
    queryFn: () => tApi.get<CustomerProfile>("/customer/profile"),
  });
}

export interface UpdateProfileInput {
  phone?: string | null;
  address?: string | null;
}

export function useUpdateProfile() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      tApi.patch<CustomerProfile>("/customer/profile", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer", slug, "profile"] });
    },
  });
}
