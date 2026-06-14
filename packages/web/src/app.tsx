import { lazy, Suspense, type ComponentType } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { queryClient } from "./lib/query-client";
import { Toaster } from "./components/ui/sonner";
import { BootSplash } from "./components/boot-splash";

// Layouts
import { AuthLayout } from "./components/layouts/auth-layout";
import { AdminLayout } from "./components/layouts/admin-layout";
import { CustomerLayout } from "./components/layouts/customer-layout";
import { SuperAdminLayout } from "./components/layouts/super-admin-layout";

// Guards
import { RequireAuth } from "./components/guards/require-auth";
import { RequireRole } from "./components/guards/require-role";
import { AuthBootGate } from "./components/auth-boot-gate";

// Pages load lazily per route (#59): a customer on a phone must not download
// the superadmin + admin areas (and papaparse) just to see the catalog. The
// pages use named exports, hence the `.then` adapters.
const lazyPage = <M, K extends keyof M>(load: () => Promise<M>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType }))) as ComponentType;

// Auth pages — eager: they are the entry path for every user.
import { LoginPage } from "./pages/auth/login-page";
import { ForgotPasswordPage } from "./pages/auth/forgot-password-page";
import { ResetPasswordPage } from "./pages/auth/reset-password-page";
import { WelcomePage } from "./pages/auth/welcome-page";

// Admin pages
const DashboardPage = lazyPage(() => import("./pages/admin/dashboard-page"), "DashboardPage");
const ProductsPage = lazyPage(() => import("./pages/admin/products-page"), "ProductsPage");
const CategoriesPage = lazyPage(() => import("./pages/admin/categories-page"), "CategoriesPage");
const CustomersPage = lazyPage(() => import("./pages/admin/customers-page"), "CustomersPage");
const CustomerBrandPricingPage = lazyPage(
  () => import("./pages/admin/customer-brand-pricing-page"),
  "CustomerBrandPricingPage",
);
const OrdersPage = lazyPage(() => import("./pages/admin/orders-page"), "OrdersPage");
const OrderDetailPage = lazyPage(
  () => import("./pages/admin/order-detail-page"),
  "OrderDetailPage",
);
const SettingsPage = lazyPage(() => import("./pages/admin/settings-page"), "SettingsPage");
const ProductFormPage = lazyPage(
  () => import("./pages/admin/product-form-page"),
  "ProductFormPage",
);
const ProductsImportPage = lazyPage(
  () => import("./pages/admin/products-import-page"),
  "ProductsImportPage",
);
const UsersPage = lazyPage(() => import("./pages/admin/users-page"), "UsersPage");
const CustomerUsersPage = lazyPage(
  () => import("./pages/admin/customer-users-page"),
  "CustomerUsersPage",
);

// Customer pages
const CatalogPage = lazyPage(() => import("./pages/customer/catalog-page"), "CatalogPage");
const CartPage = lazyPage(() => import("./pages/customer/cart-page"), "CartPage");
const OrderHistoryPage = lazyPage(
  () => import("./pages/customer/order-history-page"),
  "OrderHistoryPage",
);
const CustomerOrderDetailPage = lazyPage(
  () => import("./pages/customer/order-detail-page"),
  "OrderDetailPage",
);
const ProfilePage = lazyPage(() => import("./pages/customer/profile-page"), "ProfilePage");

// Superadmin pages
const TenantsPage = lazyPage(() => import("./pages/superadmin/tenants-page"), "TenantsPage");
const NewTenantPage = lazyPage(() => import("./pages/superadmin/new-tenant-page"), "NewTenantPage");
const SuperAdminSettingsPage = lazyPage(
  () => import("./pages/superadmin/settings-page"),
  "SuperAdminSettingsPage",
);

// Other
const HomePage = lazyPage(() => import("./pages/home-page"), "HomePage");
const NotFoundPage = lazyPage(() => import("./pages/not-found-page"), "NotFoundPage");

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBootGate>
          <Suspense fallback={<BootSplash />}>
            <Routes>
              {/* Platform-level auth — used by superadmin (no tenant context).
              `/` and `/login` both render LoginPage: anonymous users see the
              login form, authenticated users are redirected to their home (or
              see a tenant picker if they belong to multiple tenants). */}
              <Route element={<AuthLayout />}>
                <Route index element={<LoginPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              </Route>

              {/* Superadmin */}
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <RequireRole allowed={["superadmin"]}>
                      <SuperAdminLayout />
                    </RequireRole>
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="tenants" replace />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="tenants/new" element={<NewTenantPage />} />
                <Route path="settings" element={<SuperAdminSettingsPage />} />
              </Route>

              {/* Tenant routes — all live under /k/:slug. */}
              <Route path="/k/:slug">
                {/* Tenant-scoped auth */}
                <Route element={<AuthLayout />}>
                  <Route path="login" element={<LoginPage />} />
                  <Route path="auth/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="auth/reset-password" element={<ResetPasswordPage />} />
                  <Route path="welcome" element={<WelcomePage />} />
                </Route>

                <Route
                  path="admin"
                  element={
                    <RequireAuth>
                      <RequireRole allowed={["owner", "staff"]}>
                        <AdminLayout />
                      </RequireRole>
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="orders" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="products/new" element={<ProductFormPage />} />
                  <Route path="products/import" element={<ProductsImportPage />} />
                  <Route path="products/:id" element={<ProductFormPage />} />
                  <Route path="categories" element={<CategoriesPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="customers/:id/users" element={<CustomerUsersPage />} />
                  <Route
                    path="customers/:id/brand-pricing"
                    element={<CustomerBrandPricingPage />}
                  />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                <Route
                  element={
                    <RequireAuth>
                      <RequireRole allowed={["customer"]}>
                        <CustomerLayout />
                      </RequireRole>
                    </RequireAuth>
                  }
                >
                  <Route path="catalog" element={<CatalogPage />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="orders" element={<OrderHistoryPage />} />
                  <Route path="orders/:id" element={<CustomerOrderDetailPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>

                <Route index element={<HomePage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthBootGate>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
