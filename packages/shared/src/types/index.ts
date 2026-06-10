// TypeScript interfaces matching DB schema (camelCase).
// Postgres `numeric` columns (prices, percentages) serialize as strings
// through postgres-js — model them as `string` and convert at the edge.

export type MembershipRole = "owner" | "staff" | "customer";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type ProductUnit = "bottle" | "case" | "keg";
export type ErpStatus = "pending" | "transmitted";
export type OrderItemStatus = "active" | "cancelled";

/**
 * A user's membership in a single tenant. One row per (userId, tenantId).
 */
export interface TenantMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: MembershipRole;
  customerId: string | null;
  invitedBy: { name: string; email: string } | null;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  brand: string;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
  sku: string | null;
  erpRef: string | null;
  basePrice: string;
  unit: ProductUnit;
  volumeMl: number | null;
  alcoholPct: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  contactPerson: string | null;
  notes: string | null;
  vatId: string | null;
  taxOffice: string | null;
  profession: string | null;
  billingAddress: string | null;
  erpRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  erpStatus: ErpStatus;
  erpMark: string | null;
  erpTransmittedAt: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  originalQuantity: number | null;
  unitPrice: string;
  productName: string;
  status: OrderItemStatus;
  replacedByItemId: string | null;
}
