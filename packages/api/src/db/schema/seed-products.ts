import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { productUnitEnum } from "./enums";

export const seedProducts = pgTable(
  "seed_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    brand: text("brand"),
    categoryName: text("category_name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    volumeMl: integer("volume_ml"),
    alcoholPct: numeric("alcohol_pct", { precision: 4, scale: 1 }),
    unit: productUnitEnum("unit").notNull().default("bottle"),
  },
  (table) => [
    uniqueIndex("seed_products_name_brand_idx").on(table.name, table.brand),
  ],
);
