import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "../db/connection";
import {
  users,
  sessions,
  accounts,
  verifications,
} from "../db/schema/index";
import { config } from "../config";
import { sendMagicLink, sendPasswordReset } from "../services/email";

const baseDomainHost = config.baseDomain.split(":")[0] || "";
// Browsers and the Public Suffix List reject cookies with Domain=.localhost,
// so cross-subdomain cookies are unusable on localhost dev. Each subdomain
// keeps its own host-only cookie in that case.
const enableCrossSubDomainCookies = baseDomainHost !== "localhost";

// Better-auth needs a baseURL to construct callback URLs. We don't know the
// real subdomain at instance-creation time (multi-tenant), so we provide a
// placeholder and rewrite the host in plugin callbacks using the request.
const fallbackBaseURL = `${config.protocol}://${config.baseDomain}`;

export const auth = betterAuth({
  baseURL: fallbackBaseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users,
      sessions,
      accounts,
      verifications,
    },
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordReset(user.email, url, "KavaNow");
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
      kavaId: {
        type: "string",
        required: false,
        input: false,
      },
      customerId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  advanced: {
    cookiePrefix: "kava",
    database: {
      generateId: false,
    },
    ...(enableCrossSubDomainCookies && {
      crossSubDomainCookies: {
        enabled: true,
        domain: `.${baseDomainHost}`,
      },
    }),
    useSecureCookies: !config.isDev,
  },
  trustedOrigins: [
    `${config.protocol}://${config.baseDomain}`,
    ...(config.isDev
      ? [`http://*.${baseDomainHost}:${config.baseDomain.split(":")[1] || "5173"}`]
      : [`https://*.${baseDomainHost}`]),
  ],
  plugins: [
    magicLink({
      // Browsers and link-safety scanners frequently pre-fetch links, which
      // would consume a single-attempt token before the user actually clicks.
      // Allow a few attempts and hash the token at rest.
      allowedAttempts: 3,
      storeToken: "hashed",
      expiresIn: 60 * 60, // 1 hour, generous for invites
      sendMagicLink: async ({ email, url }, ctx) => {
        // The plugin builds `url` from auth.baseURL (a static fallback). For
        // multi-tenant subdomains we rewrite the host using the request that
        // triggered the link, so it points back to the right kava.
        const requestHost =
          ctx?.headers?.get?.("x-forwarded-host") ||
          ctx?.headers?.get?.("host");
        const finalUrl = requestHost
          ? `${config.protocol}://${requestHost}${new URL(url).pathname}${new URL(url).search}`
          : url;
        await sendMagicLink(email, finalUrl, "KavaNow");
      },
    }),
  ],
});

export type Auth = typeof auth;
