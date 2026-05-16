import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/connection";
import { users, sessions, accounts, verifications } from "../db/schema/index";
import { config } from "../config";
import { sendPasswordSet } from "../services/email";

export const auth = betterAuth({
  baseURL: config.appOrigin,
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
      // Invites land users on /welcome; password resets on /auth/reset-password.
      // The redirectTo is embedded URL-encoded in `url`'s callbackURL param.
      const isInvite = decodeURIComponent(url).includes("/welcome");
      await sendPasswordSet(user.email, url, "KavaNow", isInvite ? "invite" : "reset");
    },
  },
  ...(config.google.enabled && {
    socialProviders: {
      google: {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        // Invite-only: reject Google logins for emails that don't already have a users row.
        disableSignUp: true,
      },
    },
  }),
  account: {
    accountLinking: {
      enabled: true,
      // Google verifies emails — safe to auto-link a Google sign-in to an existing user row
      // (e.g. an invited user who never set a password).
      trustedProviders: ["google"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      isSuperAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  advanced: {
    cookiePrefix: "kava",
    database: {
      generateId: false,
    },
    useSecureCookies: !config.isDev,
  },
  trustedOrigins: [config.appOrigin],
  plugins: [],
});

export type Auth = typeof auth;
