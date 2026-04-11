// TypeScript interfaces matching DB schema (camelCase)

export type UserRole = "owner" | "staff" | "customer" | "superadmin";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type ProductUnit = "bottle" | "case" | "keg";

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
  role: UserRole;
  kavaId: string;
  customerId: string | null;
  hasPassword: boolean;
  createdAt: string;
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
  brand: string | null;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
  sku: string | null;
  basePrice: number;
  unit: ProductUnit;
  volumeMl: number | null;
  alcoholPct: number | null;
  active: boolean;
  createdAt: string;
}

export interface PricingTier {
  id: string;
  kavaId: string;
  name: string;
  discountPct: number;
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
  pricingTierId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerProduct {
  customerId: string;
  productId: string;
  customPrice: number | null;
  active: boolean;
}

export interface Order {
  id: string;
  kavaId: string;
  customerId: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
}

export interface SeedProduct {
  id: string;
  name: string;
  brand: string | null;
  categoryName: string;
  description: string | null;
  imageUrl: string | null;
  volumeMl: number | null;
  alcoholPct: number | null;
  unit: ProductUnit;
}
