import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_id_created_at_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
  ],
);
