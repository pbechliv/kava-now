import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
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
type AuthState = { user: AuthUser | null; memberships: TenantMembership[] };

export function useAuth() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery<AuthState>({
    queryKey: ["auth"],
    // A 401 means "logged out" — a definite answer, not an error. Returning it
    // as data (instead of throwing) keeps the query in a *success* state, which
    // respects staleTime. An errored query is always stale and refetches on
    // every observer mount, so any re-render/remount loop turned this into a
    // /api/auth/me flood + a permanent spinner. redirectOn401:false stops api.ts
    // from bouncing the window on the probe — the guards below do the redirect.
    queryFn: async () => {
      try {
        return await api.get<AuthMeResponse>("/api/auth/me", { redirectOn401: false });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return { user: null, memberships: [] };
        }
        throw err;
      }
    },
    // Only transient failures (network blip, 5xx during a deploy) reach here now
    // — retry them so a logged-in user isn't stranded on the login form.
    retry: (failureCount) => failureCount < 2,
  });
  const { slug } = useParams({ strict: false });

  // The query only errors on non-401 failures (network, 5xx): auth state is
  // unknown, not "logged out". Consumers render a retry panel (AuthUnavailable)
  // instead of treating the user as anonymous.
  const isAuthUnknown = !!error;

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

/**
 * Self-service toggle: the current user opts in/out of receiving every order's
 * notification in the given tenant. Writes the per-membership flag and refreshes
 * `/api/auth/me` so `currentMembership.notifyAllOrders` reflects the change.
 */
export function useUpdateNotificationPreference(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notifyAllOrders: boolean) =>
      api.patch<{ notifyAllOrders: boolean }>(
        `/api/k/${slug}/admin/settings/notification-preference`,
        { notifyAllOrders },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}
