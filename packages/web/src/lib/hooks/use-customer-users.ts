import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";

export interface CustomerUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  createdAt: string;
  invitedByName: string | null;
  invitedByEmail: string | null;
}

interface CustomerUsersResponse {
  users: CustomerUser[];
}

export interface InviteCustomerUserInput {
  email: string;
  name: string;
}

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
