import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/connection";
import {
  pushSubscriptions,
  tenantMemberships,
  customerAssignedUsers,
  users,
} from "../db/schema/index";
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

/**
 * Recipients for a new-order notification: the union of (a) the customer's
 * assigned users and (b) every owner/staff member who opted into all-order
 * notifications, deduped by user id. Returns ids (push) + emails (mail).
 *
 * `excludeUserId` drops the user who triggered the action — you don't get
 * notified about your own order.
 *
 * MUST be called inside the tenant request transaction — customer_assigned_users
 * is RLS-scoped, so on the base pool (e.g. a post-commit callback) it returns
 * zero rows. Resolve here, then dispatch the lists post-commit.
 */
export async function orderNotificationRecipients(
  tenantId: string,
  customerId: string,
  excludeUserId?: string,
): Promise<{ userId: string; email: string }[]> {
  const [assigned, optedIn] = await Promise.all([
    db
      .select({ userId: customerAssignedUsers.userId, email: users.email })
      .from(customerAssignedUsers)
      .innerJoin(users, eq(users.id, customerAssignedUsers.userId))
      .where(
        and(
          eq(customerAssignedUsers.tenantId, tenantId),
          eq(customerAssignedUsers.customerId, customerId),
        ),
      ),
    db
      .select({ userId: tenantMemberships.userId, email: users.email })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          ne(tenantMemberships.role, "customer"),
          eq(tenantMemberships.notifyAllOrders, true),
        ),
      ),
  ]);

  const byId = new Map<string, string>();
  for (const r of [...assigned, ...optedIn]) byId.set(r.userId, r.email);
  if (excludeUserId) byId.delete(excludeUserId);
  return [...byId].map(([userId, email]) => ({ userId, email }));
}
