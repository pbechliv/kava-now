import "./load-env";
import { z } from "zod";

const isDev = process.env.NODE_ENV !== "production";

const DEV_DEFAULTS = {
  databaseUrl: "postgresql://postgres:postgres@localhost:5432/kavanow",
  appOrigin: "http://localhost:3200",
  // better-auth signs session cookies with this. Fine for local dev; production
  // must provide its own BETTER_AUTH_SECRET (enforced below).
  betterAuthSecret: "kavanow-dev-only-secret-not-for-production-use",
} as const;

// ".env" files often leave values blank (VAR=) — treat those as unset.
const emptyToUndefined = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

const envSchema = z.object({
  DATABASE_URL: z.url().optional(),
  APP_DATABASE_URL: z.url().optional(),
  APP_ORIGIN: z.url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  SENTRY_DSN_API: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(emptyToUndefined);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}
const env = parsed.data;

// In production, refuse to boot on missing or dev-default critical values —
// a misconfigured deploy must fail loudly, not run with insecure secrets.
if (!isDev) {
  const problems: string[] = [];
  if (!env.BETTER_AUTH_SECRET) {
    problems.push("BETTER_AUTH_SECRET is required (generate with: openssl rand -hex 32)");
  } else if (env.BETTER_AUTH_SECRET === DEV_DEFAULTS.betterAuthSecret) {
    problems.push("BETTER_AUTH_SECRET is set to the dev default");
  }
  if (!env.APP_ORIGIN) {
    problems.push("APP_ORIGIN is required (e.g. https://kavanow.gr)");
  } else if (env.APP_ORIGIN === DEV_DEFAULTS.appOrigin) {
    problems.push("APP_ORIGIN is set to the dev default");
  }
  const serverDbUrl = env.APP_DATABASE_URL ?? env.DATABASE_URL;
  if (!serverDbUrl) {
    problems.push("APP_DATABASE_URL (or DATABASE_URL) is required");
  } else if (serverDbUrl === DEV_DEFAULTS.databaseUrl) {
    problems.push("the database URL is set to the dev default");
  }
  // Email transport: without it the SMTP fallback points at localhost:1025
  // (Mailpit — dev only), and since sends are best-effort, every invite and
  // password reset would fail silently. Invites are the only path to new
  // users, so a quiet email outage is an onboarding outage (#64).
  const smtpHost = env.SMTP_HOST?.toLowerCase();
  const smtpIsLocal = !smtpHost || smtpHost === "localhost" || smtpHost === "127.0.0.1";
  if (!env.RESEND_API_KEY && smtpIsLocal) {
    problems.push(
      "no email transport: set RESEND_API_KEY or a non-localhost SMTP_HOST " +
        "(invite + password-reset emails would silently go nowhere)",
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with invalid environment:\n- ${problems.join("\n- ")}`,
    );
  }
}

const databaseUrl = env.DATABASE_URL || DEV_DEFAULTS.databaseUrl;

export const config = {
  // Privileged connection — used by migrations/seeds (owns the schema, can
  // create roles). NOT used by the running server.
  databaseUrl,
  // Connection the running server uses. Should point at the NOSUPERUSER
  // `kavanow_app` role so RLS is enforced. Falls back to the privileged URL in
  // dev (RLS bypassed); production must set APP_DATABASE_URL.
  appDatabaseUrl: env.APP_DATABASE_URL || databaseUrl,
  // Canonical origin of the running app — used for absolute URLs in outbound
  // email (invites, password resets, order notifications) and as better-auth's
  // baseURL / trustedOrigins. Single-host now that tenants live in URL paths.
  appOrigin: env.APP_ORIGIN || DEV_DEFAULTS.appOrigin,
  // Secret better-auth uses for session-cookie signing and hashing.
  betterAuthSecret: env.BETTER_AUTH_SECRET || DEV_DEFAULTS.betterAuthSecret,
  smtp: {
    host: env.SMTP_HOST || "localhost",
    port: env.SMTP_PORT || 1025,
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.SMTP_FROM || "noreply@kavanow.gr",
  },
  resend: {
    apiKey: env.RESEND_API_KEY || "",
    from: env.RESEND_FROM || env.SMTP_FROM || "noreply@kavanow.gr",
  },
  sentry: {
    dsn: env.SENTRY_DSN_API || "",
    environment: env.SENTRY_ENVIRONMENT || (isDev ? "development" : "production"),
    release: env.SENTRY_RELEASE,
    enabled: !!env.SENTRY_DSN_API,
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    enabled: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
  },
  isDev,
} as const;
