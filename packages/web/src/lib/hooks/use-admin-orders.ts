import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OrderStatus } from "@kava-now/shared";

interface OrderFilters {
  status?: OrderStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminOrderRow {
  id: string;
  customerId: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  customerName: string | null;
  itemCount: number;
  total: number;
}

export interface AdminOrderDetail {
  id: string;
  customerId: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: string;
  }[];
  total: number;
}

export function useAdminOrders(filters?: OrderFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.customerId) params.set("customerId", filters.customerId);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);

  const qs = params.toString();
  const path = `/api/admin/orders${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => api.get<AdminOrderRow[]>(path),
  });
}

export function useAdminOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "orders", id],
    queryFn: () => api.get<AdminOrderDetail>(`/api/admin/orders/${id}`),
    enabled: !!id,
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.put(`/api/admin/orders/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });
}
