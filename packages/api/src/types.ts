import type { InferSelectModel } from "drizzle-orm";
import type { kavas, users } from "./db/schema/index";

export type Kava = InferSelectModel<typeof kavas>;
export type User = InferSelectModel<typeof users>;

export type AppEnv = {
  Variables: {
    kava: Kava | null;
    kavaId: string | null;
    isPlatform: boolean;
    isSuperAdmin: boolean;
    user: User | null;
    sessionId: string | null;
  };
};
