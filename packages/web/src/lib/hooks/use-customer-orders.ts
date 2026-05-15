import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Order, OrderItem, CreateOrderInput } from "@kava-now/shared";
import { useCartStore } from "../store/cart";

interface OrderSummary {
  id: string;
  status: string;
  notes: string | null;
  createdAt: string;
  itemCount: number;
  totalAmount: number;
}

interface OrderDetail extends Order {
  items: OrderItem[];
}

interface CreateOrderResponse {
  order: Order;
  items: OrderItem[];
}

export function useCustomerOrders() {
  return useQuery({
    queryKey: ["customer", "orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/customer/orders"),
  });
}

export function useCustomerOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["customer", "orders", id],
    queryFn: () => api.get<OrderDetail>(`/api/customer/orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  const clearCart = useCartStore((s) => s.clearCart);

  return useMutation({
    mutationFn: (data: CreateOrderInput) =>
      api.post<CreateOrderResponse>("/api/customer/orders", data),
    onSuccess: () => {
      clearCart();
      void qc.invalidateQueries({ queryKey: ["customer", "orders"] });
    },
  });
}

export function useReorder(orderId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<CreateOrderResponse>(`/api/customer/orders/${orderId}/reorder`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customer", "orders"] });
    },
  });
}
