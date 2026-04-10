import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
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
  return useQuery({
    queryKey: ["admin", "dashboard", "stats"],
    queryFn: () => api.get<DashboardStats>("/api/admin/dashboard/stats"),
  });
}
