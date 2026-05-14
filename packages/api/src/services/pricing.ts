/**
 * Resolve the final price for a product given a brand-level discount.
 *
 * If a discount percentage is provided, it is applied to the base price.
 * Otherwise the base price is returned as-is.
 *
 * All parameters arrive as strings (Drizzle numeric columns) and the
 * function returns a plain number rounded to 2 decimals.
 */
export function resolvePrice(basePrice: string, discountPct: string | null): number {
  const base = Number(basePrice);

  if (discountPct !== null) {
    const discount = Number(discountPct);
    return round2(base * (1 - discount / 100));
  }

  return round2(base);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
