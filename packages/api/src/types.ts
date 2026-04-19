import type { InferSelectModel } from "drizzle-orm";
import type { kavas } from "./db/schema/index";
import type { auth } from "./auth";

export type Kava = InferSelectModel<typeof kavas>;
export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;

export type AppEnv = {
  Variables: {
    kava: Kava | null;
    kavaId: string | null;
    isPlatform: boolean;
    isSuperAdmin: boolean;
    user: AuthUser | null;
    session: AuthSession | null;
  };
};
