import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { decodeAuthEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { users, sessions, accounts, verifications } from "../db/schema/index";
import { config } from "../config";
import { sendPasswordSet } from "../services/email";

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
      // Invites land users on /welcome; password resets on /auth/reset-password.
      // The redirectTo is embedded URL-encoded in `url`'s callbackURL param,
      // so decode before matching.
      const isInvite = decodeURIComponent(url).includes("/welcome");
      await sendPasswordSet(realEmail, url, "KavaNow", isInvite ? "invite" : "reset");
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
  plugins: [],
});

export type Auth = typeof auth;
