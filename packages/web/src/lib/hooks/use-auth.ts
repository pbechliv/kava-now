import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import * as Sentry from "@sentry/react";
import { api } from "../api";
import type { TenantMembership } from "@kava-now/shared";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  hasPassword: boolean;
}

export interface AuthMeResponse {
  user: AuthUser;
  memberships: TenantMembership[];
}

/**
 * Hook for authenticated user state. Returns the global user + their list of
 * tenant memberships. The "current" membership (matching the URL's `:slug`
 * param, if any) is also exposed for convenience.
 */
export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    retry: false,
  });
  const { slug } = useParams<{ slug: string }>();

  const user = data?.user ?? null;
  const memberships = data?.memberships ?? [];
  const currentMembership = slug ? (memberships.find((m) => m.tenantSlug === slug) ?? null) : null;
  const tenant = currentMembership
    ? {
        id: currentMembership.tenantId,
        slug: currentMembership.tenantSlug,
        name: currentMembership.tenantName,
      }
    : null;

  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id });
      Sentry.setTag("user.is_superadmin", user.isSuperAdmin);
    } else {
      Sentry.setUser(null);
    }
    Sentry.setTag("tenant.id", tenant?.id ?? null);
    Sentry.setTag("tenant.slug", tenant?.slug ?? null);
    Sentry.setTag("membership.role", currentMembership?.role ?? null);
  }, [user, tenant, currentMembership]);

  return {
    user,
    memberships,
    currentMembership,
    tenant,
    isLoading,
    isAuthenticated: !!user,
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
