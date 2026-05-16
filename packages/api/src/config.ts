import "./load-env";

const isDev = process.env.NODE_ENV !== "production";

export const config = {
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow",
  // Canonical origin of the running app — used for absolute URLs in outbound
  // email (invites, password resets, order notifications) and as better-auth's
  // baseURL / trustedOrigins. Single-host now that tenants live in URL paths.
  appOrigin: process.env.APP_ORIGIN || (isDev ? "http://localhost:5173" : "https://kavanow.gr"),
  cookieSecret: process.env.COOKIE_SECRET || "dev-secret-change-in-production-at-least-32-chars",
  smtp: {
    host: process.env.SMTP_HOST || "localhost",
    port: Number(process.env.SMTP_PORT) || 1025,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "noreply@kavanow.gr",
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.RESEND_FROM || process.env.SMTP_FROM || "noreply@kavanow.gr",
  },
  sentry: {
    dsn: process.env.SENTRY_DSN_API || "",
    environment: process.env.SENTRY_ENVIRONMENT || (isDev ? "development" : "production"),
    release: process.env.SENTRY_RELEASE || undefined,
    enabled: !!process.env.SENTRY_DSN_API,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    enabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
  },
  isDev,
} as const;
