import "./load-env";

export const config = {
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow",
  baseDomain: process.env.BASE_DOMAIN || "lvh.me:5173",
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
  isDev: process.env.NODE_ENV !== "production",
  get protocol() {
    return this.isDev ? "http" : "https";
  },
} as const;
