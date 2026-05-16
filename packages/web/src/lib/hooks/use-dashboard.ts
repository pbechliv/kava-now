import { useQuery } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { OrderStatus } from "@kava-now/shared";

export interface DashboardStats {
  ordersToday: number;
  pendingOrders: number;
  ordersThisWeek: number;
  totalCustomers: number;
  recentOrders: {
    id: string;
    status: OrderStatus;
    createdAt: string;
    customerName: string | null;
    itemCount: number;
    total: number;
  }[];
}

export function useDashboardStats() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "dashboard", "stats"],
    queryFn: () => tApi.get<DashboardStats>("/admin/dashboard/stats"),
  });
}
