import { describe, expect, it } from "vitest";
import { auth } from "./index";

// Config invariant — no DB needed (postgres-js connects lazily, and we only
// read the in-memory better-auth options).
//
// Regression guard for invited-user Google sign-in. Invited users are created
// with emailVerified=false and no password (invite-user.ts). better-auth's
// account-linking refuses to link a social provider to such a row unless
// `requireLocalEmailVerified` is false — otherwise "Continue with Google" on
// /welcome fails with "account not linked" (surfaced as "user doesn't exist").
//
// A full idToken E2E would need a stubbed Google token verifier injected into
// the real auth instance, which would leak test-only branches into production
// config. This asserts the exact config the linking path depends on instead —
// matching the upgrade-guard intent of the "public signup is disabled" test in
// routes/auth.test.ts: a better-auth default change or a refactor dropping the
// line would silently re-break invited-user Google sign-in.
describe("auth account linking (invited-user Google sign-in)", () => {
  const accountLinking = auth.options.account?.accountLinking;

  it("links trusted providers without requiring the local email to be verified", () => {
    expect(accountLinking?.enabled).toBe(true);
    expect(accountLinking?.requireLocalEmailVerified).toBe(false);
  });

  it("trusts Google so its verified email is enough to link", () => {
    expect(accountLinking?.trustedProviders).toContain("google");
  });
});
