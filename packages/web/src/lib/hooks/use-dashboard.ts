import { useQuery } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { DashboardStatsResponse } from "@kava-now/shared";

// Local alias for the historical name used by the dashboard page.
export type DashboardStats = DashboardStatsResponse;

export function useDashboardStats() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "dashboard", "stats"],
    queryFn: () => tApi.get<DashboardStats>("/admin/dashboard/stats"),
  });
}
