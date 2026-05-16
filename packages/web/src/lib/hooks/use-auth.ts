import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { api } from "../api";
import type { KavaMembership } from "@kava-now/shared";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  hasPassword: boolean;
}

export interface AuthMeResponse {
  user: AuthUser;
  memberships: KavaMembership[];
}

/**
 * Hook for authenticated user state. Returns the global user + their list of
 * kava memberships. The "current" membership (matching the URL's `:slug`
 * param, if any) is also exposed for convenience.
 */
export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    retry: false,
  });
  const { slug } = useParams<{ slug: string }>();

  const memberships = data?.memberships ?? [];
  const currentMembership = slug ? (memberships.find((m) => m.kavaSlug === slug) ?? null) : null;
  const kava = currentMembership
    ? {
        id: currentMembership.kavaId,
        slug: currentMembership.kavaSlug,
        name: currentMembership.kavaName,
      }
    : null;

  return {
    user: data?.user ?? null,
    memberships,
    currentMembership,
    kava,
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
