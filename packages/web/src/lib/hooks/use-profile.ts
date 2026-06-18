import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { CustomerProfileResponse, UpdateProfileInput } from "@kava-now/shared";

export type { UpdateProfileInput };

// Local alias for the historical name used by the profile page.
export type CustomerProfile = CustomerProfileResponse;

export function useProfile() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["customer", slug, "profile"],
    queryFn: () => tApi.get<CustomerProfile>("/customer/profile"),
  });
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
