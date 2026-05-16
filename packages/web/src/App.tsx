import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { queryClient } from "./lib/query-client";
import { Toaster } from "./components/ui/sonner";
import { isSuperAdminDomain } from "./lib/is-superadmin";
import { isPlatformDomain } from "./lib/is-platform";
import { useAuth } from "./lib/hooks/use-auth";

// Layouts
import { AuthLayout } from "./components/layouts/AuthLayout";
import { AdminLayout } from "./components/layouts/AdminLayout";
import { CustomerLayout } from "./components/layouts/CustomerLayout";
import { SuperAdminLayout } from "./components/layouts/SuperAdminLayout";

// Guards
import { RequireAuth } from "./components/guards/RequireAuth";
import { RequireRole } from "./components/guards/RequireRole";

// Auth pages
import { LoginPage } from "./pages/auth/LoginPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { WelcomePage } from "./pages/auth/WelcomePage";
import { ConfirmPage } from "./pages/auth/ConfirmPage";

// Admin pages
import { DashboardPage } from "./pages/admin/DashboardPage";
import { ProductsPage } from "./pages/admin/ProductsPage";
import { CategoriesPage } from "./pages/admin/CategoriesPage";
import { CustomersPage } from "./pages/admin/CustomersPage";
import { CustomerBrandPricingPage } from "./pages/admin/CustomerBrandPricingPage";
import { OrdersPage } from "./pages/admin/OrdersPage";
import { OrderDetailPage } from "./pages/admin/OrderDetailPage";
import { SettingsPage } from "./pages/admin/SettingsPage";
import { ProductFormPage } from "./pages/admin/ProductFormPage";
import { ProductsImportPage } from "./pages/admin/ProductsImportPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { CustomerUsersPage } from "./pages/admin/CustomerUsersPage";

// Customer pages
import { CatalogPage } from "./pages/customer/CatalogPage";
import { CartPage } from "./pages/customer/CartPage";
import { OrderHistoryPage } from "./pages/customer/OrderHistoryPage";
import { OrderDetailPage as CustomerOrderDetailPage } from "./pages/customer/OrderDetailPage";
import { ProfilePage } from "./pages/customer/ProfilePage";

// Superadmin pages
import { KavasPage } from "./pages/superadmin/KavasPage";
import { NewKavaPage } from "./pages/superadmin/NewKavaPage";
import { SuperAdminSettingsPage } from "./pages/superadmin/SettingsPage";

// Platform pages
import { KavaSelectPage } from "./pages/platform/KavaSelectPage";

// Other
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

function SuperAdminHome() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={isAuthenticated ? "/superadmin/kavas" : "/login"} replace />;
}

function SuperAdminApp() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/confirm" element={<ConfirmPage />} />
      </Route>

      <Route
        path="/superadmin"
        element={
          <RequireAuth>
            <RequireRole allowed={["superadmin"]}>
              <SuperAdminLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route path="kavas" element={<KavasPage />} />
        <Route path="kavas/new" element={<NewKavaPage />} />
        <Route path="settings" element={<SuperAdminSettingsPage />} />
      </Route>

      <Route path="/" element={<SuperAdminHome />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function PlatformApp() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/" element={<KavaSelectPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function TenantApp() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/confirm" element={<ConfirmPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireRole allowed={["owner", "staff"]}>
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/import" element={<ProductsImportPage />} />
        <Route path="products/:id" element={<ProductFormPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id/users" element={<CustomerUsersPage />} />
        <Route path="customers/:id/brand-pricing" element={<CustomerBrandPricingPage />} />
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
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders" element={<OrderHistoryPage />} />
        <Route path="/orders/:id" element={<CustomerOrderDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  const isSuperAdmin = isSuperAdminDomain();
  const isPlatform = isPlatformDomain();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {isSuperAdmin ? <SuperAdminApp /> : isPlatform ? <PlatformApp /> : <TenantApp />}
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
