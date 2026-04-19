import { encodeAuthEmail } from "@kava-now/shared";

const baseDomainHost = (
  import.meta.env.VITE_BASE_DOMAIN || "lvh.me:5173"
).split(":")[0]!;

/**
 * Returns the subdomain ("admin", "demo", ...) of the current host, or null
 * for the platform / bare-domain case.
 */
function currentSubdomain(): string | null {
  const hostname = window.location.hostname;
  if (hostname === baseDomainHost || hostname === "127.0.0.1") return null;
  const stripped = hostname.replace(`.${baseDomainHost}`, "");
  if (!stripped || stripped === hostname) return null;
  return stripped;
}

/**
 * Convert the user's real email into the synthesized identifier better-auth
 * stores in `users.email`. Superadmin (admin subdomain or platform) keeps
 * the email unchanged; tenant users get a `<local>_at_<domain>--<slug>@kava.internal` string.
 */
export function authEmailFor(realEmail: string): string {
  const sub = currentSubdomain();
  // Superadmin and platform have no per-tenant scope.
  if (!sub || sub === "admin") return realEmail;
  return encodeAuthEmail(realEmail, sub);
}
