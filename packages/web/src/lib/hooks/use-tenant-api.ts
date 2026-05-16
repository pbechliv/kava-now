import { useParams } from "react-router";
import { api } from "../api";

/**
 * Returns the slug for the current tenant route. Throws if used outside a
 * `/k/:slug/*` route — caller bug.
 */
export function useTenantSlug(): string {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) throw new Error("useTenantSlug must be used inside a /k/:slug route");
  return slug;
}

/**
 * Wraps `api` so each call is prefixed with `/api/k/<slug>`. Use inside any
 * hook that lives under a tenant-scoped route.
 */
export function useTenantApi() {
  const slug = useTenantSlug();
  const prefix = `/api/k/${slug}`;
  return {
    get: <T>(path: string) => api.get<T>(`${prefix}${path}`),
    post: <T>(path: string, body?: unknown) => api.post<T>(`${prefix}${path}`, body),
    put: <T>(path: string, body?: unknown) => api.put<T>(`${prefix}${path}`, body),
    patch: <T>(path: string, body?: unknown) => api.patch<T>(`${prefix}${path}`, body),
    delete: <T>(path: string) => api.delete<T>(`${prefix}${path}`),
  };
}
