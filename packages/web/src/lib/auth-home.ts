import type { AuthUser } from "./hooks/use-auth";

const baseDomainHost = (import.meta.env.VITE_BASE_DOMAIN || "lvh.me:5173").split(":")[0];

export interface UserHomeTarget {
  subdomain: string | null;
  path: string;
}

export function getUserHome(user: AuthUser, kavaSlug: string | null): UserHomeTarget {
  if (user.role === "superadmin") {
    return { subdomain: "admin", path: "/superadmin/kavas" };
  }
  if (!kavaSlug) {
    return { subdomain: null, path: "/" };
  }
  if (user.role === "customer") {
    return { subdomain: kavaSlug, path: "/catalog" };
  }
  return { subdomain: kavaSlug, path: "/admin/dashboard" };
}

export function resolveHomeHref(target: UserHomeTarget): {
  href: string;
  isSameSubdomain: boolean;
} {
  const currentHost = window.location.hostname;
  const targetHost = target.subdomain
    ? `${target.subdomain}.${baseDomainHost}`
    : baseDomainHost;
  const isSameSubdomain = currentHost === targetHost;
  const port = window.location.port ? `:${window.location.port}` : "";
  const href = isSameSubdomain
    ? target.path
    : `${window.location.protocol}//${targetHost}${port}${target.path}`;
  return { href, isSameSubdomain };
}
