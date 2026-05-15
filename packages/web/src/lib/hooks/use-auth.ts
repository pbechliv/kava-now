import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Kava, UserRole } from "@kava-now/shared";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hasPassword: boolean;
  invitedBy: { name: string; email: string } | null;
}

export interface AuthMeResponse {
  user: AuthUser;
  kava: Kava | null;
}

export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    retry: false,
  });

  return {
    user: data?.user ?? null,
    kava: data?.kava ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
  };
}

export interface UpdateMeInput {
  name?: string;
  email?: string;
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api.patch<{ success: boolean }>("/api/auth/me", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}
