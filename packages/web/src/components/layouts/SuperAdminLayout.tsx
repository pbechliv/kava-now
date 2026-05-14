import { useState } from "react";
import { Outlet, NavLink } from "react-router";
import { useAuth } from "../../lib/hooks/use-auth";
import { useLogout } from "../../lib/hooks/use-logout";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium rounded-md ${
    isActive ? "bg-amber-50 text-amber-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
  }`;

export function SuperAdminLayout() {
  const { user } = useAuth();
  const logout = useLogout();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-amber-600">KavaNow Admin</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/superadmin/kavas" className={navLinkClass}>
              Κάβες
            </NavLink>
            <NavLink to="/superadmin/settings" className={navLinkClass}>
              Ρυθμίσεις
            </NavLink>
          </nav>
        </div>

        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <span>{user?.name}</span>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                  {user?.email}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => logout.mutate()}
                >
                  Αποσύνδεση
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
