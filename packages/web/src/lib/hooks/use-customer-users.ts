import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

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
  return useQuery({
    queryKey: ["admin", "customer-users", customerId],
    queryFn: () => api.get<CustomerUsersResponse>(`/api/admin/customers/${customerId}/users`),
    enabled: !!customerId,
  });
}

export function useInviteCustomerUser(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteCustomerUserInput) =>
      api.post<{ success: boolean }>(`/api/admin/customers/${customerId}/users/invite`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "customer-users", customerId] });
    },
  });
}

export function useResendCustomerUserInvite(customerId: string) {
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<{ success: boolean }>(
        `/api/admin/customers/${customerId}/users/${userId}/resend-invite`,
      ),
  });
}
