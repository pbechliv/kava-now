import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  AdminCustomerUserListItem,
  AdminCustomerUsersSearch,
  InviteCustomerUserInput,
  PaginatedResponse,
  SuccessResponse,
} from "@kava-now/shared";

type CustomerUsersFilters = AdminCustomerUsersSearch & { pageSize?: number };

/**
 * Customer-linked users across the tenant, each row tagged with its customer;
 * `customerId` narrows the list to one customer.
 */
export function useCustomerUsers(filters?: CustomerUsersFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/admin/customer-users", filters);
  return useQuery({
    queryKey: ["admin", slug, "customer-users", filters],
    queryFn: () => tApi.get<PaginatedResponse<AdminCustomerUserListItem>>(path),
    placeholderData: keepPreviousData,
  });
}

/** Invite a user into a customer — the target customer is picked per invite. */
export function useInviteCustomerUser() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, ...input }: InviteCustomerUserInput & { customerId: string }) =>
      tApi.post<SuccessResponse>(`/admin/customers/${customerId}/users/invite`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "customer-users"] });
    },
  });
}
