import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "../db/connection";
import { sessions, users } from "../db/schema/index";
import { config } from "../config";

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: !config.isDev,
      sameSite: "lax",
      ...(config.isDev
        ? { domain: ".lvh.me" }
        : { domain: `.${config.baseDomain.split(":")[0]}` }),
    },
  },
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      name: attributes.name,
      role: attributes.role,
      kavaId: attributes.kavaId,
      customerId: attributes.customerId,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      name: string;
      role: "owner" | "staff" | "customer" | "superadmin";
      kava_id: string | null;
      kavaId: string | null;
      customer_id: string | null;
      customerId: string | null;
    };
  }
}
