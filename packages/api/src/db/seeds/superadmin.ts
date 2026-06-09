// ".env" files often leave values blank (VAR=) — treat blank as unset so the
// dev fallbacks (or the production guard below) kick in. provision.yml writes
// SUPERADMIN_PASSWORD=$SECRET verbatim, so an unset GitHub secret arrives
// here as "" — without this, `"" ?? fallback` would seed an empty password.
const envEmail = process.env.SUPERADMIN_EMAIL?.trim() || undefined;
const envPassword = process.env.SUPERADMIN_PASSWORD || undefined;

// Mirror config.ts's boot validation: production must never seed the
// well-known dev credentials. The superadmin bypasses requireRole in every
// tenant, so a guessable password here is a platform-wide takeover.
if (process.env.NODE_ENV === "production" && (!envPassword || envPassword.length < 16)) {
  throw new Error(
    "Refusing to seed in production: SUPERADMIN_PASSWORD must be set and at least 16 characters.",
  );
}

export const SUPERADMIN_EMAIL = envEmail ?? "panos.bechlivanos@gmail.com";
export const SUPERADMIN_PASSWORD = envPassword ?? "supersecret";
export const SUPERADMIN_NAME = "Super Admin";
