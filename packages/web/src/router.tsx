import { lazy, Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import {
  adminOrdersSearchSchema,
  adminProductsSearchSchema,
  adminCustomersSearchSchema,
  catalogSearchSchema,
  pageOnlySearchSchema,
  type ImportProductsResult,
} from "@kava-now/shared";

import { BootSplash } from "./components/boot-splash";
import { AuthBootGate } from "./components/auth-boot-gate";

// Layouts — eager: small, shared chrome rendered on every navigation.
import { AuthLayout } from "./components/layouts/auth-layout";
import { AdminLayout } from "./components/layouts/admin-layout";
import { CustomerLayout } from "./components/layouts/customer-layout";
import { SuperAdminLayout } from "./components/layouts/super-admin-layout";

// Guards
import { RequireAuth } from "./components/guards/require-auth";
import { RequireRole } from "./components/guards/require-role";

// Auth pages — eager: they are the entry path for every user.
import { LoginPage } from "./pages/auth/login-page";
import { ForgotPasswordPage } from "./pages/auth/forgot-password-page";
import { ResetPasswordPage } from "./pages/auth/reset-password-page";
import { WelcomePage } from "./pages/auth/welcome-page";

// Devtools are dev-only; the PROD branch is statically dead-code-eliminated so
// the package never lands in production bundles.
const RouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    );

// Typed search schemas — the migration's concrete type-safety upgrade over the
// old `searchParams.get("…") ?? ""` string coercion.
const tokenSearchSchema = z.object({
  token: z.string().optional().catch(""),
});

// Welcome (invite) carries the email for post-set-password auto-login, and an
// `error` param better-auth appends when the invite token is expired/invalid
// at click time (#165).
const welcomeSearchSchema = z.object({
  token: z.string().optional().catch(""),
  email: z.string().optional().catch(""),
  error: z.string().optional().catch(""),
});

// Forgot-password can be reached with a prefilled email (e.g. the "request a
// new link" CTA on an expired invite).
const emailSearchSchema = z.object({
  email: z.string().optional().catch(""),
});

// Pages load lazily per route (#59): a customer on a phone must not download
// the superadmin + admin areas (and papaparse) just to see the catalog.
// `lazyRouteComponent` adapts the pages' named exports and wires preloading.
const DashboardPage = lazyRouteComponent(
  () => import("./pages/admin/dashboard-page"),
  "DashboardPage",
);
const ProductsPage = lazyRouteComponent(
  () => import("./pages/admin/products-page"),
  "ProductsPage",
);
const ProductsImportPage = lazyRouteComponent(
  () => import("./pages/admin/products-import-page"),
  "ProductsImportPage",
);
const CategoriesPage = lazyRouteComponent(
  () => import("./pages/admin/categories-page"),
  "CategoriesPage",
);
const CustomersPage = lazyRouteComponent(
  () => import("./pages/admin/customers-page"),
  "CustomersPage",
);
const CustomerUsersPage = lazyRouteComponent(
  () => import("./pages/admin/customer-users-page"),
  "CustomerUsersPage",
);
const CustomerBrandPricingPage = lazyRouteComponent(
  () => import("./pages/admin/customer-brand-pricing-page"),
  "CustomerBrandPricingPage",
);
const UsersPage = lazyRouteComponent(() => import("./pages/admin/users-page"), "UsersPage");
const OrdersPage = lazyRouteComponent(() => import("./pages/admin/orders-page"), "OrdersPage");
const AdminOrderDetailPage = lazyRouteComponent(
  () => import("./pages/admin/order-detail-page"),
  "OrderDetailPage",
);
const ManagePage = lazyRouteComponent(() => import("./pages/admin/manage-page"), "ManagePage");
const SettingsPage = lazyRouteComponent(
  () => import("./pages/admin/settings-page"),
  "SettingsPage",
);

const CatalogPage = lazyRouteComponent(
  () => import("./pages/customer/catalog-page"),
  "CatalogPage",
);
const CartPage = lazyRouteComponent(() => import("./pages/customer/cart-page"), "CartPage");
const OrderHistoryPage = lazyRouteComponent(
  () => import("./pages/customer/order-history-page"),
  "OrderHistoryPage",
);
const CustomerOrderDetailPage = lazyRouteComponent(
  () => import("./pages/customer/order-detail-page"),
  "OrderDetailPage",
);
const ProfilePage = lazyRouteComponent(
  () => import("./pages/customer/profile-page"),
  "ProfilePage",
);

const TenantsPage = lazyRouteComponent(
  () => import("./pages/superadmin/tenants-page"),
  "TenantsPage",
);
const NewTenantPage = lazyRouteComponent(
  () => import("./pages/superadmin/new-tenant-page"),
  "NewTenantPage",
);
const SuperAdminSettingsPage = lazyRouteComponent(
  () => import("./pages/superadmin/settings-page"),
  "SuperAdminSettingsPage",
);

const HomePage = lazyRouteComponent(() => import("./pages/home-page"), "HomePage");
const NotFoundPage = lazyRouteComponent(() => import("./pages/not-found-page"), "NotFoundPage");

// ---------------------------------------------------------------------------
// Route tree — path-based multi-tenancy: platform auth + superadmin at the
// root, everything tenant-scoped under /k/$slug.
// ---------------------------------------------------------------------------

const rootRoute = createRootRoute({
  component: function RootComponent() {
    return (
      <AuthBootGate>
        <Suspense fallback={<BootSplash />}>
          <Outlet />
          <RouterDevtools />
        </Suspense>
      </AuthBootGate>
    );
  },
});

// Platform-level auth — used by superadmin (no tenant context). `/` and
// `/login` both render LoginPage: anonymous users see the login form,
// authenticated users redirect to their home (or a tenant picker).
const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth-layout",
  component: AuthLayout,
});
const indexRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/",
  component: LoginPage,
});
const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/login",
  component: LoginPage,
});
const forgotPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/auth/forgot-password",
  validateSearch: emailSearchSchema,
  component: ForgotPasswordPage,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/auth/reset-password",
  validateSearch: tokenSearchSchema,
  component: ResetPasswordPage,
});

// Superadmin
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: function SuperAdminGuarded() {
    return (
      <RequireAuth>
        <RequireRole allowed={["superadmin"]}>
          <SuperAdminLayout />
        </RequireRole>
      </RequireAuth>
    );
  },
});
const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/admin/tenants" });
  },
});
const tenantsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "tenants",
  component: TenantsPage,
  validateSearch: pageOnlySearchSchema,
});
const newTenantRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "tenants/new",
  component: NewTenantPage,
});
const superAdminSettingsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "settings",
  component: SuperAdminSettingsPage,
});

// Tenant routes — all live under /k/$slug. A route with no component renders
// an <Outlet /> by default.
const tenantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$slug",
});

// Tenant-scoped auth
const tenantAuthLayoutRoute = createRoute({
  getParentRoute: () => tenantRoute,
  id: "tenant-auth-layout",
  component: AuthLayout,
});
const tenantLoginRoute = createRoute({
  getParentRoute: () => tenantAuthLayoutRoute,
  path: "login",
  component: LoginPage,
});
const tenantForgotPasswordRoute = createRoute({
  getParentRoute: () => tenantAuthLayoutRoute,
  path: "auth/forgot-password",
  validateSearch: emailSearchSchema,
  component: ForgotPasswordPage,
});
const tenantResetPasswordRoute = createRoute({
  getParentRoute: () => tenantAuthLayoutRoute,
  path: "auth/reset-password",
  validateSearch: tokenSearchSchema,
  component: ResetPasswordPage,
});
const welcomeRoute = createRoute({
  getParentRoute: () => tenantAuthLayoutRoute,
  path: "welcome",
  validateSearch: welcomeSearchSchema,
  component: WelcomePage,
});

// Tenant admin (owner + staff)
const tenantAdminRoute = createRoute({
  getParentRoute: () => tenantRoute,
  path: "admin",
  component: function AdminGuarded() {
    return (
      <RequireAuth>
        <RequireRole allowed={["owner", "staff"]}>
          <AdminLayout />
        </RequireRole>
      </RequireAuth>
    );
  },
});
const tenantAdminIndexRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/k/$slug/admin/dashboard", params: { slug: params.slug } });
  },
});
const dashboardRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "dashboard",
  component: DashboardPage,
});
const productsRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "products",
  component: ProductsPage,
  validateSearch: adminProductsSearchSchema,
});
const productsImportRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "products/import",
  component: ProductsImportPage,
});
const categoriesRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "categories",
  component: CategoriesPage,
});
const customersRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "customers",
  component: CustomersPage,
  validateSearch: adminCustomersSearchSchema,
});
const customerUsersRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "customers/$id/users",
  component: CustomerUsersPage,
});
const customerBrandPricingRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "customers/$id/brand-pricing",
  component: CustomerBrandPricingPage,
});
const usersRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "users",
  component: UsersPage,
});
const ordersRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "orders",
  validateSearch: adminOrdersSearchSchema,
  component: OrdersPage,
});
const orderDetailRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "orders/$id",
  component: AdminOrderDetailPage,
});
const manageRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "manage",
  component: ManagePage,
});
const settingsRoute = createRoute({
  getParentRoute: () => tenantAdminRoute,
  path: "settings",
  component: SettingsPage,
});

// Tenant customer (customer role)
const tenantCustomerLayoutRoute = createRoute({
  getParentRoute: () => tenantRoute,
  id: "tenant-customer-layout",
  component: function CustomerGuarded() {
    return (
      <RequireAuth>
        <RequireRole allowed={["customer"]}>
          <CustomerLayout />
        </RequireRole>
      </RequireAuth>
    );
  },
});
const catalogRoute = createRoute({
  getParentRoute: () => tenantCustomerLayoutRoute,
  path: "catalog",
  component: CatalogPage,
  validateSearch: catalogSearchSchema,
});
const cartRoute = createRoute({
  getParentRoute: () => tenantCustomerLayoutRoute,
  path: "cart",
  component: CartPage,
});
const customerOrdersRoute = createRoute({
  getParentRoute: () => tenantCustomerLayoutRoute,
  path: "orders",
  component: OrderHistoryPage,
  validateSearch: pageOnlySearchSchema,
});
const customerOrderDetailRoute = createRoute({
  getParentRoute: () => tenantCustomerLayoutRoute,
  path: "orders/$id",
  component: CustomerOrderDetailPage,
});
const profileRoute = createRoute({
  getParentRoute: () => tenantCustomerLayoutRoute,
  path: "profile",
  component: ProfilePage,
});

const tenantIndexRoute = createRoute({
  getParentRoute: () => tenantRoute,
  path: "/",
  component: HomePage,
});

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([indexRoute, loginRoute, forgotPasswordRoute, resetPasswordRoute]),
  adminRoute.addChildren([adminIndexRoute, tenantsRoute, newTenantRoute, superAdminSettingsRoute]),
  tenantRoute.addChildren([
    tenantAuthLayoutRoute.addChildren([
      tenantLoginRoute,
      tenantForgotPasswordRoute,
      tenantResetPasswordRoute,
      welcomeRoute,
    ]),
    tenantAdminRoute.addChildren([
      tenantAdminIndexRoute,
      dashboardRoute,
      productsRoute,
      productsImportRoute,
      categoriesRoute,
      customersRoute,
      customerUsersRoute,
      customerBrandPricingRoute,
      usersRoute,
      ordersRoute,
      orderDetailRoute,
      manageRoute,
      settingsRoute,
    ]),
    tenantCustomerLayoutRoute.addChildren([
      catalogRoute,
      cartRoute,
      customerOrdersRoute,
      customerOrderDetailRoute,
      profileRoute,
    ]),
    tenantIndexRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFoundPage,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  // Custom history state: RequireAuth stashes the deep link before bouncing to
  // login; the products import flow hands its result to the products list.
  interface HistoryState {
    from?: { pathname: string; search: string };
    importResult?: ImportProductsResult;
  }
}
