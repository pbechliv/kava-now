import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { queryClient } from "./lib/query-client";

// Layouts
import { AuthLayout } from "./components/layouts/AuthLayout";
import { AdminLayout } from "./components/layouts/AdminLayout";
import { CustomerLayout } from "./components/layouts/CustomerLayout";

// Guards
import { RequireAuth } from "./components/guards/RequireAuth";
import { RequireRole } from "./components/guards/RequireRole";

// Auth pages
import { LoginPage } from "./pages/auth/LoginPage";
import { VerifyPage } from "./pages/auth/VerifyPage";
import { RegisterPage } from "./pages/auth/RegisterPage";

// Admin pages
import { DashboardPage } from "./pages/admin/DashboardPage";
import { ProductsPage } from "./pages/admin/ProductsPage";
import { CategoriesPage } from "./pages/admin/CategoriesPage";
import { CustomersPage } from "./pages/admin/CustomersPage";
import { CustomerProductsPage } from "./pages/admin/CustomerProductsPage";
import { PricingPage } from "./pages/admin/PricingPage";
import { OrdersPage } from "./pages/admin/OrdersPage";
import { OrderDetailPage } from "./pages/admin/OrderDetailPage";
import { SettingsPage } from "./pages/admin/SettingsPage";
import { ProductFormPage } from "./pages/admin/ProductFormPage";

// Customer pages
import { CatalogPage } from "./pages/customer/CatalogPage";
import { CartPage } from "./pages/customer/CartPage";
import { OrderHistoryPage } from "./pages/customer/OrderHistoryPage";
import { ProfilePage } from "./pages/customer/ProfilePage";

// Other
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/verify" element={<VerifyPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Admin routes */}
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
            <Route path="products/:id" element={<ProductFormPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id/products" element={<CustomerProductsPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Customer routes */}
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
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<HomePage />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
