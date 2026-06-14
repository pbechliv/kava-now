import { sql, type SQLWrapper } from "drizzle-orm";
import { escapeLike } from "./escape-like";

/**
 * Accent-insensitive, case-insensitive substring match on `column`.
 *
 * Folds diacritics on both the column and the search term via `f_unaccent`
 * (see drizzle/0008_enable_unaccent.sql) so e.g. a search of "καφες" matches a
 * stored "καφές". Still plain substring matching — no typo tolerance or
 * ranking. The search term is wildcard-escaped before being wrapped in `%...%`.
 */
export function accentInsensitiveLike(column: SQLWrapper, search: string) {
  const pattern = `%${escapeLike(search)}%`;
  return sql`f_unaccent(${column}) ilike f_unaccent(${pattern})`;
}
