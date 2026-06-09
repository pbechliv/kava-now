/**
 * Canonical form for user-identity emails: one `users` row per real human
 * requires every write and lookup to agree on casing. Apply at every boundary
 * where an email enters the system (invites, tenant creation, profile edits,
 * seeds) — the lower(email) unique index on `users` is only the backstop.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
