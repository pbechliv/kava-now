import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface KavaUser {
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
  users: KavaUser[];
}

export interface InviteUserInput {
  email: string;
  name: string;
  role: "staff";
}

export function useUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<UsersResponse>("/api/admin/users"),
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      api.post<{ success: boolean }>("/api/admin/users/invite", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "customer-users"] });
    },
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean }>(
        `/api/admin/users/${id}/resend-invite`,
      ),
  });
}

export function usePromoteToOwner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean }>(
        `/api/admin/users/${id}/promote-to-owner`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
