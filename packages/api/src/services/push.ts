import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/connection";
import { pushSubscriptions, tenantMemberships, customerAssignedUsers } from "../db/schema/index";
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
 * User ids to push a new-order notification to: the union of (a) the customer's
 * assigned users and (b) every owner/staff member who opted into all-order
 * notifications, deduped. (Order emails were removed — push only.)
 *
 * `excludeUserId` drops the user who triggered the action — you don't get
 * notified about your own order.
 *
 * MUST be called inside the tenant request transaction — customer_assigned_users
 * is RLS-scoped, so on the base pool (e.g. a post-commit callback) it returns
 * zero rows. Resolve here, then dispatch post-commit.
 */
export async function orderNotificationRecipients(
  tenantId: string,
  customerId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const [assigned, optedIn] = await Promise.all([
    db
      .select({ userId: customerAssignedUsers.userId })
      .from(customerAssignedUsers)
      .where(
        and(
          eq(customerAssignedUsers.tenantId, tenantId),
          eq(customerAssignedUsers.customerId, customerId),
        ),
      ),
    db
      .select({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          ne(tenantMemberships.role, "customer"),
          eq(tenantMemberships.notifyAllOrders, true),
        ),
      ),
  ]);

  const ids = new Set<string>();
  for (const r of [...assigned, ...optedIn]) ids.add(r.userId);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

/**
 * User ids of the customer's own login users — every membership with the
 * `customer` role linked to this customer in this tenant. Used to notify the
 * customer when staff resolve a cancellation request.
 *
 * `tenant_memberships` is global (not RLS-scoped), so unlike
 * `orderNotificationRecipients` this is safe to call anywhere — but callers
 * still resolve in-request and dispatch post-commit for consistency.
 */
export async function customerUserRecipients(
  tenantId: string,
  customerId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.role, "customer"),
        eq(tenantMemberships.customerId, customerId),
      ),
    );

  const ids = new Set<string>();
  for (const r of rows) ids.add(r.userId);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}
