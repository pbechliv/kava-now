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

export const auth = betterAuth({
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
    crossSubDomainCookies: {
      enabled: true,
      domain: `.${baseDomainHost}`,
    },
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
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLink(email, url, "KavaNow");
      },
    }),
  ],
});

export type Auth = typeof auth;
