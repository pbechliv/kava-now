/**
 * Resolve the final price for a product given a brand-level discount.
 *
 * If a discount percentage is provided, it is applied to the base price.
 * Otherwise the base price is returned as-is.
 *
 * All parameters arrive as strings (Drizzle numeric columns) and the function
 * returns a plain number with at most 2 decimals. The math runs in integer
 * cents: floating point misrounds halves whose binary image lands below .5 —
 * e.g. 2.01 at 50% is 1.005, but 1.005 * 100 === 100.49999999999999, so the
 * old `Math.round(n * 100) / 100` stored 1.00 instead of 1.01.
 */
export function resolvePrice(basePrice: string, discountPct: string | null): number {
  // numeric(10,2) → integer cents. The *100 product of a 2-decimal string is
  // within one ulp of an integer, so Math.round recovers it exactly.
  const baseCents = Math.round(Number(basePrice) * 100);

  if (discountPct !== null) {
    // numeric(5,2) → percent in basis points (integer).
    const pctBps = Math.round(Number(discountPct) * 100);
    // Half-up commercial rounding on the exact integer ratio.
    return Math.round((baseCents * (10000 - pctBps)) / 10000) / 100;
  }

  return baseCents / 100;
}
