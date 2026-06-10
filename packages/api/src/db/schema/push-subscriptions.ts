import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Web Push subscriptions — one row per (user, browser/device endpoint).
 * Global like `users` (no RLS): a subscription belongs to a person, not a
 * tenant; tenant scoping happens when choosing recipients for an event.
 * Subscribing/unsubscribing a device IS the user's push preference.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The push service URL is unique per browser registration. A device that
    // re-subscribes under a different account re-binds the endpoint (upsert).
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
);
