import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type {
  ErpStatus,
  OrderItemStatus,
  OrderStatus,
  PaginatedResponse,
} from "@kava-now/shared";

interface OrderFilters {
  status?: OrderStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminOrderRow {
  id: string;
  customerId: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  customerName: string | null;
  erpStatus: ErpStatus;
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
  customerAddress: string | null;
  customerVatId: string | null;
  customerTaxOffice: string | null;
  customerProfession: string | null;
  customerBillingAddress: string | null;
  customerErpRef: string | null;
  erpStatus: ErpStatus;
  erpMark: string | null;
  erpTransmittedAt: string | null;
  erpTransmittedBy: string | null;
  erpTransmittedByName: string | null;
  erpTransmittedByEmail: string | null;
  items: AdminOrderItem[];
  total: number;
}

export interface AdminOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  originalQuantity: number | null;
  unitPrice: string;
  status: OrderItemStatus;
  replacedByItemId: string | null;
  sku: string | null;
  erpRef: string | null;
}

export function useAdminOrders(filters?: OrderFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.customerId) params.set("customerId", filters.customerId);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/admin/orders${qs ? `?${qs}` : ""}`;

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

function useInvalidateOrder(orderId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin", slug, "orders"] });
    void qc.invalidateQueries({ queryKey: ["admin", slug, "orders", orderId] });
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
