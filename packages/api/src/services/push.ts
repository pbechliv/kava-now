import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/connection";
import { pushSubscriptions, tenantMemberships } from "../db/schema/index";
import { config } from "../config";

if (config.push.enabled) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path the notification deep-links to, e.g. /k/demo/admin/orders/<id>. */
  url: string;
}

/**
 * Best-effort Web Push to every subscribed device of the given users. Push
 * augments email — failures are logged, never thrown — and expired
 * subscriptions (404/410 from the push service) are pruned as they surface.
 * Callers fire this post-commit (afterTenantCommit), like the emails.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!config.push.enabled || userIds.length === 0) return;

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 },
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // The browser dropped the subscription — clean up our copy.
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id))
            .catch(() => {});
          return;
        }
        console.error("[push] send failed:", statusCode ?? err);
      }
    }),
  );
}

/** All owner/staff user ids of a tenant (order-placed notifications). */
export async function tenantStaffUserIds(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, tenantId), ne(tenantMemberships.role, "customer")));
  return rows.map((r) => r.userId);
}

/** All user ids linked to a customer entity (status-change notifications). */
export async function customerUserIds(tenantId: string, customerId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .where(
      and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.customerId, customerId)),
    );
  return rows.map((r) => r.userId);
}
