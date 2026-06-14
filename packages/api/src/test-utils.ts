/**
 * Test-only: assert a value is present and return it narrowed. Replaces the
 * non-null assertion (`!`) on known-present fixtures (just-inserted rows,
 * captured cookies) so test code follows the same no-`!` rule as src.
 */
export function must<T>(value: T | null | undefined): T {
  if (value == null) {
    throw new Error("Expected value to be defined");
  }
  return value;
}
