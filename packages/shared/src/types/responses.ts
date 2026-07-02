// Wire-contract response shapes returned by the API and consumed by the web
// hooks. Defined once here so a change to a handler's `select({...})` / `c.json`
// shape and the frontend's expectation are checked against the same type.
//
// Numeric note (see ./index): entity money/percent columns serialize as
// `string` (postgres-js). SQL-cast aggregates (`::int` / `::float8`) come back
// as JSON `number` — modelled as such below.

import type {
  Category,
  Customer,
  Order,
  OrderItem,
  OrderStatus,
  ErpStatus,
  ProductUnit,
  Product,
  TenantMembership,
} from "./index";

// ---- Orders (admin) ----

export interface AdminOrderListItem {
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

// Admin order detail omits orderId on items (implied by the URL) and joins the
// product's sku/erpRef.
export type AdminOrderItemWithProduct = Omit<OrderItem, "orderId"> & {
  sku: string | null;
  erpRef: string | null;
};

export interface AdminOrderDetailResponse {
  id: string;
  customerId: string;
  status: OrderStatus;
  notes: string | null;
  internalNotes: string | null;
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
  items: AdminOrderItemWithProduct[];
  total: number;
}

// ---- Orders (customer) ----

export interface CustomerOrderListItem {
  id: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  itemCount: number;
  totalAmount: number;
}

// Customer detail deliberately omits ERP internals and tenantId; item rows omit
// orderId (implied by the URL).
export interface CustomerOrderDetailResponse {
  id: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  items: Omit<OrderItem, "orderId">[];
}

export interface CreateOrderResponse {
  order: Order;
  items: OrderItem[];
}

// ---- Products ----

export interface ProductWithCategoryName extends Product {
  categoryName: string | null;
}

/** (name, brand) pairs — unpaginated, for the product-import preview. */
export interface ProductNameBrandKey {
  name: string;
  brand: string;
}

// ---- Categories ----

export interface CategoryWithParentName extends Category {
  parentName: string | null;
}

// ---- Catalog (customer) ----

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  imageUrl: string | null;
  unit: ProductUnit;
  volumeMl: number | null;
  // numeric column — serialized as a string by the API
  alcoholPct: string | null;
  categoryId: string | null;
  categoryName: string | null;
  resolvedPrice: number;
}

export interface CatalogCategoryChip {
  id: string;
  name: string;
  sortOrder: number;
}

/** Current price + availability for one cart product (the /catalog/resolve response). */
export interface CatalogPriceResolution {
  id: string;
  available: boolean;
  /** Current customer-resolved price; null when the product is unavailable. */
  resolvedPrice: number | null;
}

// ---- Customer brand pricing ----

export interface CustomerBrandPrice {
  brand: string;
  discountPct: number;
}

// ---- Users (admin) ----

export interface AdminUserListItem {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  role: "owner" | "staff" | "customer";
  createdAt: string;
  invitedById: string | null;
  invitedByName: string | null;
  invitedByEmail: string | null;
}

export interface UsersListResponse {
  users: AdminUserListItem[];
}

export interface CustomerLinkedUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  createdAt: string;
  invitedByName: string | null;
  invitedByEmail: string | null;
}

export interface CustomerLinkedUsersResponse {
  users: CustomerLinkedUser[];
}

// ---- Dashboard ----

export interface DashboardStatsResponse {
  ordersToday: number;
  pendingOrders: number;
  pendingErp: number;
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

// ---- Tenant settings ----

export interface TenantSettingsResponse {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string;
  logoUrl: string | null;
}

// ---- Auth / profile ----

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  hasPassword: boolean;
}

export interface AuthMeResponse {
  user: AuthUser;
  memberships: TenantMembership[];
}

// Customer-facing profile: whitelisted columns only (no internal/billing/ERP).
export type CustomerProfileResponse = Pick<
  Customer,
  "id" | "name" | "email" | "address" | "phone" | "contactPerson"
>;

// ---- Superadmin tenants ----

export interface SuperAdminTenantListItem {
  id: string;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
}

export interface CreateTenantResponse {
  success: boolean;
  slug: string;
  hasPassword: boolean;
}

// ---- Mutations ----

/**
 * Body returned by mutation endpoints with nothing else to report. Handlers
 * `satisfies` this so the API and the web hooks type the same shape.
 */
export interface SuccessResponse {
  success: true;
}

/**
 * DELETE /admin/products/:id — `product` is present when the delete was
 * downgraded to a soft-delete (deactivation) because order items reference it.
 */
export interface DeleteProductResponse {
  success: true;
  product?: Product;
}
