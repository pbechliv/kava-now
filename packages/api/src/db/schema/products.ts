import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { productUnitEnum } from "./enums";
import { kavas } from "./kavas";
import { categories } from "./categories";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kavaId: uuid("kava_id")
      .notNull()
      .references(() => kavas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    imageUrl: text("image_url"),
    sku: text("sku"),
    erpRef: text("erp_ref"),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
    unit: productUnitEnum("unit").notNull().default("bottle"),
    volumeMl: integer("volume_ml"),
    alcoholPct: numeric("alcohol_pct", { precision: 4, scale: 1 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_kava_name_brand_idx").on(table.kavaId, table.name, table.brand),
  ],
);
