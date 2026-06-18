import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  OrderStatus,
  CreateOrderInput,
  CreateOrderResponse,
  CustomerOrderListItem,
  CustomerOrderDetailResponse,
  PageOnlySearch,
  PaginatedResponse,
} from "@kava-now/shared";
import { useCartStore } from "../store/cart";

type CustomerOrdersFilters = PageOnlySearch & { pageSize?: number };

export function useCustomerOrders(filters?: CustomerOrdersFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/customer/orders", filters);

  return useQuery({
    queryKey: ["customer", slug, "orders", filters],
    queryFn: () => tApi.get<PaginatedResponse<CustomerOrderListItem>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerOrder(id: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["customer", slug, "orders", id],
    queryFn: () => tApi.get<CustomerOrderDetailResponse>(`/customer/orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();
  const clearCart = useCartStore((s) => s.clearCart);

  return useMutation({
    mutationFn: (data: CreateOrderInput) =>
      tApi.post<CreateOrderResponse>("/customer/orders", data),
    onSuccess: () => {
      clearCart();
      void qc.invalidateQueries({ queryKey: ["customer", slug, "orders"] });
    },
  });
}

export function useReorder(orderId: string) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => tApi.post<CreateOrderResponse>(`/customer/orders/${orderId}/reorder`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customer", slug, "orders"] });
    },
  });
}

// Cancel a pending order outright, or request cancellation of a confirmed one —
// the server decides the outcome from the order's status and returns the new one.
export function useCancelOrder(orderId: string) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      tApi.post<{ id: string; status: OrderStatus }>(`/customer/orders/${orderId}/cancel`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customer", slug, "orders"] });
      void qc.invalidateQueries({ queryKey: ["customer", slug, "orders", orderId] });
    },
  });
}
