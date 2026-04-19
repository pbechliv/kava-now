/**
 * Better-auth requires email to be globally unique, but the app's domain model
 * scopes users per kava. We pre-encode a synthetic identifier the auth layer
 * stores as `users.email` (`<local>_at_<domain>--<slug>@kava.internal`), while
 * the human-facing real email lives in `users.realEmail` and is unique only
 * within a kava.
 *
 * Superadmin users have no kava, so their auth email = their real email.
 */

const SYNTH_DOMAIN = "kava.internal";
const SLUG_SEPARATOR = "--";
const AT_REPLACEMENT = "_at_";

export function encodeAuthEmail(
  realEmail: string,
  kavaSlug: string | null,
): string {
  if (!kavaSlug) return realEmail;
  const safeReal = realEmail.replace("@", AT_REPLACEMENT);
  return `${safeReal}${SLUG_SEPARATOR}${kavaSlug}@${SYNTH_DOMAIN}`;
}

export function decodeAuthEmail(authEmail: string): string {
  if (!authEmail.endsWith(`@${SYNTH_DOMAIN}`)) return authEmail;
  const localPart = authEmail.slice(0, -1 - SYNTH_DOMAIN.length);
  const lastSep = localPart.lastIndexOf(SLUG_SEPARATOR);
  if (lastSep < 0) return authEmail;
  return localPart.slice(0, lastSep).replace(AT_REPLACEMENT, "@");
}
