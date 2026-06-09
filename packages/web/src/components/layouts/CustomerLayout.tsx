import { useEffect } from "react";
import { initials } from "@/lib/utils";
import { NavLink, Outlet, Link, useParams } from "react-router";
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
import { useCartStore, activateCartForSlug } from "@/lib/store/cart";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { Logo } from "@/components/Logo";

export function CustomerLayout() {
  const { user, tenant } = useAuth();
  const logout = useLogout();
  const { slug } = useParams<{ slug: string }>();
  const base = `/k/${slug}`;

  // Load this tenant's cart (and reset on tenant switch) — single source of
  // cart-slug wiring, so carts never bleed across tenants.
  useEffect(() => {
    if (slug) void activateCartForSlug(slug);
  }, [slug]);

  const cartCount = useCartStore((s) =>
    Object.values(s.items).reduce((sum, item) => sum + item.quantity, 0),
  );

  const navItems = [
    { to: `${base}/catalog`, label: "Κατάλογος", icon: ShoppingBag, end: true, key: "catalog" },
    { to: `${base}/cart`, label: "Καλάθι", icon: ShoppingCart, end: false, key: "cart" },
    { to: `${base}/orders`, label: "Ιστορικό", icon: ScrollText, end: false, key: "orders" },
    { to: `${base}/profile`, label: "Προφίλ", icon: UserRound, end: false, key: "profile" },
  ] as const;

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Logo className="size-7" />
            <div className="flex min-w-0 flex-col">
              <span className="text-lg font-bold leading-tight text-primary">KavaNow</span>
              {tenant && (
                <span className="truncate text-sm text-sidebar-foreground/70">{tenant.name}</span>
              )}
            </div>
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
            <Link to={`${base}/cart`} aria-label="Καλάθι">
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
              <TenantSwitcher currentSlug={slug ?? null} />
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
