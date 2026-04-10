/**
 * Resolve the final price for a product given a customer context.
 *
 * Priority:
 *  1. Custom price (per-customer override)
 *  2. Tier discount applied to base price
 *  3. Base price as-is
 *
 * All parameters arrive as strings (Drizzle numeric columns) and the
 * function returns a plain number rounded to 2 decimals.
 */
export function resolvePrice(
  basePrice: string,
  discountPct: string | null,
  customPrice: string | null,
): number {
  if (customPrice != null) {
    return round2(Number(customPrice));
  }

  const base = Number(basePrice);

  if (discountPct != null) {
    const discount = Number(discountPct);
    return round2(base * (1 - discount / 100));
  }

  return round2(base);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
