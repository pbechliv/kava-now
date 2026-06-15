import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { InviteStaffUserInput } from "@kava-now/shared";

export type InviteUserInput = InviteStaffUserInput;

export interface TenantUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  role: "owner" | "staff" | "customer";
  createdAt: string;
  invitedById: string | null;
  invitedByName: string | null;
  invitedByEmail: string | null;
}

interface UsersResponse {
  users: TenantUser[];
}

export function useUsers() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "users"],
    queryFn: () => tApi.get<UsersResponse>("/admin/users"),
  });
}

export function useInviteUser() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      tApi.post<{ success: boolean }>("/admin/users/invite", input),
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
    mutationFn: (id: string) => tApi.post<{ success: boolean }>(`/admin/users/${id}/resend-invite`),
  });
}

export function usePromoteToOwner() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      tApi.post<{ success: boolean }>(`/admin/users/${id}/promote-to-owner`),
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
    mutationFn: (id: string) =>
      tApi.post<{ success: boolean }>(`/admin/users/${id}/demote-to-staff`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", slug, "users"] });
    },
  });
}
