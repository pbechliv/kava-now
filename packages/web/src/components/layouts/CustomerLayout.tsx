import { NavLink, Outlet, Link } from "react-router";
import { LogOut, ShoppingBag, ShoppingCart, ScrollText, UserRound } from "lucide-react";
import { useAuth } from "@/lib/hooks/use-auth";
import { useLogout } from "@/lib/hooks/use-logout";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/lib/store/cart";

const navItems = [
  { to: "/catalog", label: "Κατάλογος", icon: ShoppingBag, end: true, key: "catalog" },
  { to: "/cart", label: "Καλάθι", icon: ShoppingCart, end: false, key: "cart" },
  { to: "/orders", label: "Ιστορικό", icon: ScrollText, end: false, key: "orders" },
  { to: "/profile", label: "Προφίλ", icon: UserRound, end: false, key: "profile" },
] as const;

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function CustomerLayout() {
  const { user, kava } = useAuth();
  const logout = useLogout();
  const cartCount = useCartStore((s) =>
    Object.values(s.items).reduce((sum, item) => sum + item.quantity, 0),
  );

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-lg font-bold text-primary">KavaNow</span>
            {kava && (
              <span className="truncate text-sm text-sidebar-foreground/70">/ {kava.name}</span>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.to} end={item.end}>
                        {({ isActive }) => (
                          <span
                            data-active={isActive || undefined}
                            className="flex w-full items-center gap-2 data-[active]:font-semibold data-[active]:text-sidebar-primary"
                          >
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.label}</span>
                            {item.key === "cart" && cartCount > 0 && (
                              <Badge variant="default" className="ml-auto">
                                {cartCount}
                              </Badge>
                            )}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-2 text-xs text-sidebar-foreground/60">{user?.name}</div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="flex-1" />
          <Button asChild variant="ghost" size="sm" className="relative gap-2">
            <Link to="/cart" aria-label="Καλάθι">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1.5 text-[10px] tabular-nums"
                >
                  {cartCount}
                </Badge>
              )}
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback>{initials(user?.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{user?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => logout.mutate()}>
                <LogOut className="mr-2 h-4 w-4" />
                Αποσύνδεση
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
