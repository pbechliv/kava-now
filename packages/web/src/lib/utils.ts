import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Appends defined, non-empty filters to a path as a query string.
 * Shared by the list hooks so each one doesn't rebuild URLSearchParams.
 */
export function withQuery<T extends { [K in keyof T]: string | number | undefined }>(
  path: string,
  filters?: T,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries<string | number | undefined>(filters ?? {})) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** "Panos Bechlivanos" → "PB"; used by the layout avatar fallbacks. */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
