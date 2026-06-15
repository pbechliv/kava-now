import { Link, useLocation } from "react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Numeric badge on the icon (e.g. cart count). Hidden when falsy. */
  badge?: number;
  /**
   * Path prefixes that mark this tab active (defaults to `[to]`). Used by the
   * admin "Διαχείριση" tab so it stays lit on every folded sub-page, and by
   * tabs whose detail routes live under them (e.g. `/orders/:id`).
   */
  activePrefixes?: string[];
}

function isActive(pathname: string, item: BottomNavItem): boolean {
  return (item.activePrefixes ?? [item.to]).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Mobile-only bottom tab bar (hidden at `md` and up, where the sidebar takes
 * over). Each layout feeds its own primary destinations; secondary pages are
 * reached from a hub tab or the header account menu. Sits above content with a
 * safe-area inset so it clears the iOS home indicator.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Κύρια πλοήγηση"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.badge ? (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
