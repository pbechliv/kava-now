import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { useAuth } from "../../lib/hooks/use-auth";
import { useLogout } from "../../lib/hooks/use-logout";

const navItems = [
  { to: "/catalog", label: "Κατάλογος" },
  { to: "/cart", label: "Καλάθι" },
  { to: "/orders", label: "Ιστορικό" },
  { to: "/profile", label: "Προφίλ" },
];

export function CustomerLayout() {
  const { user, kava } = useAuth();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-amber-600">KavaNow</span>
            {kava && <span className="hidden sm:inline text-sm text-gray-500">/ {kava.name}</span>}
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/catalog"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-amber-50 text-amber-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-gray-600">{user?.name}</span>
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={() => logout.mutate()}
            >
              Αποσύνδεση
            </button>

            {/* Mobile hamburger */}
            <button
              type="button"
              className="md:hidden p-2 text-gray-600"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="md:hidden border-t border-gray-200 bg-white px-4 py-2 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/catalog"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-amber-50 text-amber-700" : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
