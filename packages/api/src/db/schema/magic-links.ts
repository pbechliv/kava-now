import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { kavas } from "./kavas";

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  kavaId: uuid("kava_id")
    .notNull()
    .references(() => kavas.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  purpose: text("purpose").notNull().default("login"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
