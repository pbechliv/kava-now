import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  InviteCustomerUserInput,
  CustomerLinkedUser,
  PageOnlySearch,
  PaginatedResponse,
  SuccessResponse,
} from "@kava-now/shared";

export type { InviteCustomerUserInput };

type CustomerUsersFilters = PageOnlySearch & { pageSize?: number };

export function useCustomerUsers(customerId: string | undefined, filters?: CustomerUsersFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery(`/admin/customers/${customerId}/users`, filters);
  return useQuery({
    queryKey: ["admin", slug, "customer-users", customerId, filters],
    queryFn: () => tApi.get<PaginatedResponse<CustomerLinkedUser>>(path),
    enabled: !!customerId,
    placeholderData: keepPreviousData,
  });
}

export function useInviteCustomerUser(customerId: string) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteCustomerUserInput) =>
      tApi.post<SuccessResponse>(`/admin/customers/${customerId}/users/invite`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "customer-users", customerId] });
    },
  });
}

export function useResendCustomerUserInvite(customerId: string) {
  const tApi = useTenantApi();
  return useMutation({
    mutationFn: (userId: string) =>
      tApi.post<SuccessResponse>(`/admin/customers/${customerId}/users/${userId}/resend-invite`),
  });
}
