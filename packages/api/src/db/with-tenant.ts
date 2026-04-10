import { queryClient } from "./connection";

/**
 * Execute a callback within a transaction that has the RLS
 * session variable set. Uses SET LOCAL so the variable is
 * scoped to the transaction only.
 */
export async function withTenant<T>(
  kavaId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const result = await queryClient.begin(async (sql) => {
    await sql`SELECT set_config('app.current_kava_id', ${kavaId}, true)`;
    return callback();
  });
  return result as T;
}
