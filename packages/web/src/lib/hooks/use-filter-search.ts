import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Reads the current route's typed search params and returns a `setFilters`
 * helper that writes filter changes back into the URL — so every list filter is
 * shareable, bookmarkable, and survives reload/back-forward.
 *
 * Rules baked in here so each page doesn't repeat them:
 * - Changing any filter resets `page` to 1 (unless `page` itself is being set).
 * - Empty values (`undefined` / `""` / `null`) are dropped, keeping URLs clean.
 * - `replace: true` so typing into a search box doesn't spam browser history.
 *
 * Shared across routes, so it reads loosely (`strict: false`); the page casts
 * `search` to the route's search type.
 */
export function useFilterSearch<T extends Record<string, unknown>>() {
  const routerSearch = useRouterState({ select: (s) => s.location.search });
  const search = routerSearch as unknown as T;
  const navigate = useNavigate();

  const setFilters = useCallback(
    (next: Partial<T>) => {
      void navigate({
        to: ".",
        replace: true,
        search: (prev: Record<string, unknown>) => {
          const merged: Record<string, unknown> = { ...prev, ...next };
          if (!("page" in next)) merged.page = undefined;
          for (const key of Object.keys(merged)) {
            const value = merged[key];
            if (value === undefined || value === "" || value === null) delete merged[key];
          }
          return merged;
        },
      });
    },
    [navigate],
  );

  return { search, setFilters };
}
