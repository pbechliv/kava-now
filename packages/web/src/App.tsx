import { lazy, Suspense, type ComponentType } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { queryClient } from "./lib/query-client";
import { Toaster } from "./components/ui/sonner";
import { BootSplash } from "./components/boot-splash";

// Layouts
import { AuthLayout } from "./components/layouts/AuthLayout";
import { AdminLayout } from "./components/layouts/AdminLayout";
import { CustomerLayout } from "./components/layouts/CustomerLayout";
import { SuperAdminLayout } from "./components/layouts/SuperAdminLayout";

// Guards
import { RequireAuth } from "./components/guards/RequireAuth";
import { RequireRole } from "./components/guards/RequireRole";
import { AuthBootGate } from "./components/auth-boot-gate";

// Pages load lazily per route (#59): a customer on a phone must not download
// the superadmin + admin areas (and papaparse) just to see the catalog. The
// pages use named exports, hence the `.then` adapters.
const lazyPage = <M, K extends keyof M>(load: () => Promise<M>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType }))) as ComponentType;

// Auth pages — eager: they are the entry path for every user.
import { LoginPage } from "./pages/auth/LoginPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { WelcomePage } from "./pages/auth/WelcomePage";

// Admin pages
const DashboardPage = lazyPage(() => import("./pages/admin/DashboardPage"), "DashboardPage");
const ProductsPage = lazyPage(() => import("./pages/admin/ProductsPage"), "ProductsPage");
const CategoriesPage = lazyPage(() => import("./pages/admin/CategoriesPage"), "CategoriesPage");
const CustomersPage = lazyPage(() => import("./pages/admin/CustomersPage"), "CustomersPage");
const CustomerBrandPricingPage = lazyPage(
  () => import("./pages/admin/CustomerBrandPricingPage"),
  "CustomerBrandPricingPage",
);
const OrdersPage = lazyPage(() => import("./pages/admin/OrdersPage"), "OrdersPage");
const OrderDetailPage = lazyPage(() => import("./pages/admin/OrderDetailPage"), "OrderDetailPage");
const SettingsPage = lazyPage(() => import("./pages/admin/SettingsPage"), "SettingsPage");
const ProductFormPage = lazyPage(() => import("./pages/admin/ProductFormPage"), "ProductFormPage");
const ProductsImportPage = lazyPage(
  () => import("./pages/admin/ProductsImportPage"),
  "ProductsImportPage",
);
const UsersPage = lazyPage(() => import("./pages/admin/UsersPage"), "UsersPage");
const CustomerUsersPage = lazyPage(
  () => import("./pages/admin/CustomerUsersPage"),
  "CustomerUsersPage",
);

// Customer pages
const CatalogPage = lazyPage(() => import("./pages/customer/CatalogPage"), "CatalogPage");
const CartPage = lazyPage(() => import("./pages/customer/CartPage"), "CartPage");
const OrderHistoryPage = lazyPage(
  () => import("./pages/customer/OrderHistoryPage"),
  "OrderHistoryPage",
);
const CustomerOrderDetailPage = lazyPage(
  () => import("./pages/customer/OrderDetailPage"),
  "OrderDetailPage",
);
const ProfilePage = lazyPage(() => import("./pages/customer/ProfilePage"), "ProfilePage");

// Superadmin pages
const TenantsPage = lazyPage(() => import("./pages/superadmin/TenantsPage"), "TenantsPage");
const NewTenantPage = lazyPage(() => import("./pages/superadmin/NewTenantPage"), "NewTenantPage");
const SuperAdminSettingsPage = lazyPage(
  () => import("./pages/superadmin/SettingsPage"),
  "SuperAdminSettingsPage",
);

// Other
const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const NotFoundPage = lazyPage(() => import("./pages/NotFoundPage"), "NotFoundPage");

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
