import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  AdminOrderListItem,
  AdminOrderDetailResponse,
  AdminOrderItemWithProduct,
  AdminOrdersSearch,
  AdminCreateOrderInput,
  CreateOrderResponse,
  OrderStatus,
  PaginatedResponse,
} from "@kava-now/shared";

// Wire contracts live in @kava-now/shared (one definition for API + web).
// Local aliases keep the historical names used across the order components.
export type AdminOrderRow = AdminOrderListItem;
export type AdminOrderDetail = AdminOrderDetailResponse;
export type AdminOrderItem = AdminOrderItemWithProduct;

type OrderFilters = AdminOrdersSearch & { pageSize?: number };

export function useAdminOrders(filters?: OrderFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/admin/orders", filters);

  return useQuery({
    queryKey: ["admin", slug, "orders", filters],
    queryFn: () => tApi.get<PaginatedResponse<AdminOrderRow>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(id: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "orders", id],
    queryFn: () => tApi.get<AdminOrderDetail>(`/admin/orders/${id}`),
    enabled: !!id,
  });
}

// Staff create an order on a customer's behalf (#159). Invalidates the orders
// list + dashboard so the new order and its KPI impact show immediately.
export function useAdminCreateOrder() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateOrderInput) =>
      tApi.post<CreateOrderResponse>("/admin/orders", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "orders"] });
      void qc.invalidateQueries({ queryKey: ["admin", slug, "dashboard"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      tApi.put(`/admin/orders/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "orders"] });
      void qc.invalidateQueries({ queryKey: ["admin", slug, "dashboard"] });
    },
  });
}

export function useUpdateOrderInternalNotes() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, internalNotes }: { id: string; internalNotes: string | null }) =>
      tApi.patch(`/admin/orders/${id}/internal-notes`, { internalNotes }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "orders", id] });
    },
  });
}

export function useMarkOrderTransmitted() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, mark }: { id: string; mark: string }) =>
      tApi.patch(`/admin/orders/${id}/erp`, { mark }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "orders"] });
    },
  });
}

// Owner/superadmin-only correction of an already-transmitted MARK (a mistyped
// MARK is otherwise permanently locked). The reason is mandatory (audit trail).
export function useCorrectOrderMark() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, mark, reason }: { id: string; mark: string; reason: string }) =>
      tApi.patch(`/admin/orders/${id}/erp/mark`, { mark, reason }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "orders", id] });
      void qc.invalidateQueries({ queryKey: ["admin", slug, "orders"] });
    },
  });
}

function useInvalidateOrder(orderId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin", slug, "orders"] });
    void qc.invalidateQueries({ queryKey: ["admin", slug, "orders", orderId] });
    // Item edits change totals/counts surfaced by the dashboard.
    void qc.invalidateQueries({ queryKey: ["admin", slug, "dashboard"] });
  };
}

export function useAddOrderItem(orderId: string) {
  const tApi = useTenantApi();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      tApi.post(`/admin/orders/${orderId}/items`, { productId, quantity }),
    onSuccess: invalidate,
  });
}

export function useUpdateOrderItem(orderId: string) {
  const tApi = useTenantApi();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      tApi.patch(`/admin/orders/${orderId}/items/${itemId}`, { quantity }),
    onSuccess: invalidate,
  });
}

export function useCancelOrderItem(orderId: string) {
  const tApi = useTenantApi();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: ({ itemId }: { itemId: string }) =>
      tApi.post(`/admin/orders/${orderId}/items/${itemId}/cancel`, {}),
    onSuccess: invalidate,
  });
}

export function useReplaceOrderItem(orderId: string) {
  const tApi = useTenantApi();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: ({
      itemId,
      productId,
      quantity,
    }: {
      itemId: string;
      productId: string;
      quantity: number;
    }) =>
      tApi.post(`/admin/orders/${orderId}/items/${itemId}/replace`, {
        productId,
        quantity,
      }),
    onSuccess: invalidate,
  });
}

// Staff resolve a customer's cancellation request: approve → cancelled_by_customer,
// reject → confirmed.
export function useResolveCancellationRequest(orderId: string) {
  const tApi = useTenantApi();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: ({ decision }: { decision: "approve" | "reject" }) =>
      tApi.post(`/admin/orders/${orderId}/cancellation-request`, { decision }),
    onSuccess: invalidate,
  });
}
