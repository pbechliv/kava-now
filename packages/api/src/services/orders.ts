import { sql } from "drizzle-orm";
import type { db } from "../db/connection";

// The order-creation transaction handle (a savepoint of the surrounding tenant
// transaction).
type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Allocate the next per-tenant sequential order number (#161). Bumps the
// tenant's counter with a row-locked `UPDATE ... RETURNING` inside the caller's
// order-creation transaction: concurrent creations for the same tenant
// serialize on that row (no duplicate numbers), and a rollback reverts the
// counter (no gap). Raw SQL — not db.update — so it doesn't touch
// tenants.updatedAt. Shared by the customer checkout and the staff-created-order
// flow (#159).
export async function allocateOrderNumber(tx: OrderTx, tenantId: string): Promise<number> {
  const rows = await tx.execute<{ order_counter: number }>(
    sql`update tenants set order_counter = order_counter + 1 where id = ${tenantId} returning order_counter`,
  );
  const next = rows[0]?.order_counter;
  if (typeof next !== "number") {
    throw new Error(`Failed to allocate order number for tenant ${tenantId}`);
  }
  return next;
}
