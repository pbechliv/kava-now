import { useEffect, useState } from "react";

/**
 * Returns `value` once it has been stable for `delayMs`. Use for search
 * inputs that feed a query key — without it every keystroke is a request.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
