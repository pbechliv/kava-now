import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { decodeAuthEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { users, sessions, accounts, verifications } from "../db/schema/index";
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
      // user.email is the synthesized identifier; send to the human address.
      const realEmail = decodeAuthEmail(user.email);
      await sendPasswordReset(realEmail, url, "KavaNow");
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
      // Real email — used for sending mail and display. Set internally
      // when we synthesize the slug-prefixed `email` identifier.
      realEmail: {
        type: "string",
        required: true,
        input: true,
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
      // GHSA-hc7v-rggr-4hvx (better-auth ≥1.6.x): tokens are now consumed
      // atomically on the first verify call, so `allowedAttempts` is a no-op.
      // To survive email-link prefetch (Mailpit preview, Gmail TitanLink,
      // Outlook SafeLinks, Chrome hover), the email points at an SPA
      // `/auth/confirm` page that requires a real click to POST verify —
      // prefetchers only issue GETs against the URL in the email, which
      // is now a harmless static page.
      storeToken: "hashed",
      expiresIn: 60 * 60, // 1 hour, generous for invites
      sendMagicLink: async ({ email, url }, ctx) => {
        // better-auth builds `url` from auth.baseURL (a static fallback) and
        // points at /api/auth/magic-link/verify?token=...&callbackURL=...
        // We rewrite to the SPA's /auth/confirm page on the request's
        // subdomain, preserving the token and callbackURL for the page to
        // forward to /api/auth/magic-link/verify after a user click.
        const requestHost = ctx?.headers?.get?.("x-forwarded-host") || ctx?.headers?.get?.("host");
        const verifyURL = new URL(url);
        const token = verifyURL.searchParams.get("token") ?? "";
        const callbackURL = verifyURL.searchParams.get("callbackURL") ?? "/";
        const host = requestHost ?? config.baseDomain;
        const confirmURL = new URL(`${config.protocol}://${host}/auth/confirm`);
        confirmURL.searchParams.set("token", token);
        confirmURL.searchParams.set("callbackURL", callbackURL);
        // `email` is the synthesized identifier; send to the human address.
        const realEmail = decodeAuthEmail(email);
        await sendMagicLink(realEmail, confirmURL.toString(), "KavaNow");
      },
    }),
  ],
});

export type Auth = typeof auth;
