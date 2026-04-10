import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { kavas } from "./kavas";

export const pricingTiers = pgTable("pricing_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  kavaId: uuid("kava_id")
    .notNull()
    .references(() => kavas.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
