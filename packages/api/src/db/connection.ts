import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kavanow";

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
export { queryClient };
