import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import * as Sentry from "@sentry/react";
import { api, ApiError } from "../api";
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
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    // 401 means "not logged in" — fail fast. Anything else (network blip,
    // 5xx during a deploy) is transient: retry, or a logged-in user landing
    // on `/` gets stranded on the login form despite a valid session.
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status === 401) && failureCount < 2,
  });
  const { slug } = useParams<{ slug: string }>();

  // A non-401 failure (network, 5xx) means the server was unreachable — auth
  // state is unknown, not "logged out". Consumers render a retry panel
  // (AuthUnavailable) instead of treating the user as anonymous.
  const isAuthUnknown = !!error && !(error instanceof ApiError && error.status === 401);

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

  // Primitives only — `tenant` is a fresh object every render, so an object
  // dep array re-ran this on each render of every consumer.
  const userId = user?.id ?? null;
  const userIsSuperAdmin = user?.isSuperAdmin ?? false;
  const tenantId = tenant?.id ?? null;
  const tenantSlug = tenant?.slug ?? null;
  const membershipRole = currentMembership?.role ?? null;
  useEffect(() => {
    if (userId) {
      Sentry.setUser({ id: userId });
      Sentry.setTag("user.is_superadmin", userIsSuperAdmin);
    } else {
      Sentry.setUser(null);
    }
    Sentry.setTag("tenant.id", tenantId);
    Sentry.setTag("tenant.slug", tenantSlug);
    Sentry.setTag("membership.role", membershipRole);
  }, [userId, userIsSuperAdmin, tenantId, tenantSlug, membershipRole]);

  return {
    user,
    memberships,
    currentMembership,
    tenant,
    isLoading,
    isAuthenticated: !!user,
    isAuthUnknown,
    refetch,
    isRefetching,
    error,
  };
}

export interface UpdateMeInput {
  name?: string;
  email?: string;
  /** Required by the API when changing email — proof of account ownership. */
  currentPassword?: string;
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
