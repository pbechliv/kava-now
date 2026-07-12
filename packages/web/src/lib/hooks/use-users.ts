import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  InviteStaffUserInput,
  SuccessResponse,
  AdminUserListItem,
  PageOnlySearch,
  PaginatedResponse,
} from "@kava-now/shared";

export type InviteUserInput = InviteStaffUserInput;

type UsersFilters = PageOnlySearch & { pageSize?: number };

export function useUsers(filters?: UsersFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/admin/users", filters);
  return useQuery({
    queryKey: ["admin", slug, "users", filters],
    queryFn: () => tApi.get<PaginatedResponse<AdminUserListItem>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useInviteUser() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      tApi.post<SuccessResponse>("/admin/users/invite", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", slug, "users"] });
    },
  });
}

export function useDeleteUser() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tApi.delete(`/admin/users/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", slug, "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", slug, "customer-users"] });
    },
  });
}

export function useResendInvite() {
  const tApi = useTenantApi();
  return useMutation({
    mutationFn: (id: string) => tApi.post<SuccessResponse>(`/admin/users/${id}/resend-invite`),
  });
}

export function usePromoteToOwner() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tApi.post<SuccessResponse>(`/admin/users/${id}/promote-to-owner`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", slug, "users"] });
    },
  });
}

export function useDemoteToStaff() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tApi.post<SuccessResponse>(`/admin/users/${id}/demote-to-staff`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", slug, "users"] });
    },
  });
}
