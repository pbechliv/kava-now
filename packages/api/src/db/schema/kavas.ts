import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const kavas = pgTable("kavas", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  address: text("address"),
  phone: text("phone"),
  email: text("email").notNull(),
  notificationEmails: text("notification_emails").array().notNull().default([]),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
