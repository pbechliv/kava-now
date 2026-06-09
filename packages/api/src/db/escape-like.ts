/**
 * Escape ILIKE/LIKE wildcards in user-supplied search strings. Without this a
 * search of "%" matches every row and crafted patterns can be pathologically
 * slow; with it the characters match literally.
 */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}
