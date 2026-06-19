import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { InviteCustomerUserInput, CustomerLinkedUsersResponse } from "@kava-now/shared";

export type { InviteCustomerUserInput };

type CustomerUsersResponse = CustomerLinkedUsersResponse;

export function useCustomerUsers(customerId: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "customer-users", customerId],
    queryFn: () => tApi.get<CustomerUsersResponse>(`/admin/customers/${customerId}/users`),
    enabled: !!customerId,
  });
}

export function useInviteCustomerUser(customerId: string) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteCustomerUserInput) =>
      tApi.post<{ success: boolean }>(`/admin/customers/${customerId}/users/invite`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "customer-users", customerId] });
    },
  });
}

export function useResendCustomerUserInvite(customerId: string) {
  const tApi = useTenantApi();
  return useMutation({
    mutationFn: (userId: string) =>
      tApi.post<{ success: boolean }>(
        `/admin/customers/${customerId}/users/${userId}/resend-invite`,
      ),
  });
}
