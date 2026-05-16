import type { Context } from "hono";
import { db } from "../db/connection";
import { auditLogs } from "../db/schema/index";
import type { AppEnv } from "../types";

interface LogAuditOptions {
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write a row to audit_logs. Captures the caller from context (kavaId,
 * user.id, user.email). Failures are swallowed — auditing never breaks
 * the primary request.
 */
export async function logAudit(
  c: Context<AppEnv>,
  { action, targetType, targetId, metadata }: LogAuditOptions,
): Promise<void> {
  try {
    const user = c.get("user");
    const kavaId = c.get("kavaId");
    await db.insert(auditLogs).values({
      kavaId: kavaId ?? null,
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
