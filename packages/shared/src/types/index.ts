// TypeScript interfaces matching DB schema (camelCase)

export type MembershipRole = "owner" | "staff" | "customer";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type ProductUnit = "bottle" | "case" | "keg";
export type ErpStatus = "pending" | "transmitted";
export type OrderItemStatus = "active" | "cancelled";

export interface Kava {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string;
  notificationEmails: string[];
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  hasPassword: boolean;
  createdAt: string;
}

/**
 * A user's membership in a single kava. One row per (userId, kavaId).
 */
export interface KavaMembership {
  kavaId: string;
  kavaSlug: string;
  kavaName: string;
  role: MembershipRole;
  customerId: string | null;
  invitedBy: { name: string; email: string } | null;
}

export interface Category {
  id: string;
  kavaId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  kavaId: string;
  name: string;
  brand: string;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
  sku: string | null;
  erpRef: string | null;
  basePrice: number;
  unit: ProductUnit;
  volumeMl: number | null;
  alcoholPct: number | null;
  active: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  kavaId: string;
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
}

export interface CustomerBrandPricing {
  customerId: string;
  brand: string;
  discountPct: number;
}

export interface Order {
  id: string;
  kavaId: string;
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
  unitPrice: number;
  productName: string;
  status: OrderItemStatus;
  replacedByItemId: string | null;
}
