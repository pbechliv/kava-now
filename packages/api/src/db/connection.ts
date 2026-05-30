import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema/index";
import { config } from "../config";

// The running server connects as the *application* role, which must be a
// NOSUPERUSER role — a Postgres superuser bypasses Row-Level Security entirely,
// so connecting as the bootstrap/owner role makes every RLS policy a no-op.
// Migrations and seeds use the privileged role (DATABASE_URL) directly.
const connectionString = config.appDatabaseUrl;

if (!config.isDev && connectionString === config.databaseUrl) {
  // The app is using the same (privileged) role as migrations. RLS will NOT be
  // enforced. The deploy must set APP_DATABASE_URL to the kavanow_app role.
  console.warn(
    "[db] APP_DATABASE_URL is unset or equals DATABASE_URL — the app is connecting " +
      "as the privileged role and RLS tenant isolation is NOT enforced.",
  );
}

const queryClient = postgres(connectionString);
const baseDb = drizzle(queryClient, { schema });

type TenantTx = Parameters<Parameters<typeof baseDb.transaction>[0]>[0];

// Carries the per-request transaction that holds the tenant RLS context. Any
// query issued through the exported `db` while this store is set runs on that
// transaction's connection — the one with `app.current_tenant_id` set locally.
const tenantTxStore = new AsyncLocalStorage<TenantTx>();

function activeDb(): PostgresJsDatabase<typeof schema> | TenantTx {
  return tenantTxStore.getStore() ?? baseDb;
}

/**
 * Run `fn` inside a transaction whose connection has the tenant RLS variable
 * set transaction-locally. Every query made through the exported `db` during
 * `fn` (including nested service/middleware calls) executes on that same
 * connection, so RLS filters rows to this tenant. Because the variable is
 * transaction-local it is discarded on commit/rollback and can never leak to
 * another request that later reuses the pooled connection.
 */
export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    return tenantTxStore.run(tx, fn);
  });
}

// `db` transparently targets the active tenant transaction when one is in scope
// (tenant-scoped routes), and the base connection pool otherwise (auth,
// superadmin, global lookups). Callers keep using `db` unchanged.
export const db = new Proxy(baseDb, {
  get(_target, prop) {
    const target = activeDb();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
}) as PostgresJsDatabase<typeof schema>;

export { queryClient, baseDb };
