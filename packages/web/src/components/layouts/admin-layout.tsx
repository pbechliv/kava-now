import { Link, NavLink, Outlet, useParams } from "react-router";
import { initials } from "@/lib/utils";
import { LayoutDashboard, ClipboardList, LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "@/lib/hooks/use-auth";
import { useLogout } from "@/lib/hooks/use-logout";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { TenantSwitcher } from "@/components/tenant-switcher";
import { BottomNav, type BottomNavItem } from "@/components/bottom-nav";
import { Logo } from "@/components/logo";
import { ADMIN_NAV_GROUPS, ADMIN_MANAGE_SECTIONS } from "@/lib/admin-nav";

export function AdminLayout() {
  const { user, tenant } = useAuth();
  const logout = useLogout();
  const { slug } = useParams<{ slug: string }>();
  const base = `/k/${slug}/admin`;

  // Mobile bottom bar: the two daily destinations + a hub that folds in the
  // lower-frequency config pages. The hub tab stays lit on every one of them —
  // prefixes derive from ADMIN_MANAGE_SECTIONS so they can't drift.
  const bottomItems: BottomNavItem[] = [
    { to: `${base}/dashboard`, label: "Πίνακας", icon: LayoutDashboard },
    { to: `${base}/orders`, label: "Παραγγελίες", icon: ClipboardList },
    {
      to: `${base}/manage`,
      label: "Διαχείριση",
      icon: LayoutGrid,
      activePrefixes: [`${base}/manage`, ...ADMIN_MANAGE_SECTIONS.map((s) => `${base}/${s.path}`)],
    },
  ];

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
          {ADMIN_NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild>
                        <NavLink to={`${base}/${item.path}`}>
                          {({ isActive }) => (
                            <span
                              data-active={isActive || undefined}
                              className="flex w-full items-center gap-2 data-[active]:font-semibold data-[active]:text-sidebar-primary"
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-2 text-xs text-sidebar-foreground/60">{user?.name}</div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="hidden md:flex" />
          <Separator orientation="vertical" className="mx-1 hidden h-5 md:block" />
          {/* On mobile the sidebar is replaced by the bottom bar, so the brand
              lives in the header instead. */}
          <Link to={`${base}/dashboard`} className="flex items-center gap-2 md:hidden">
            <Logo className="size-6" />
            <span className="max-w-[12rem] truncate font-semibold">
              {tenant?.name ?? "KavaNow"}
            </span>
          </Link>
          <div className="flex-1" />
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-md:pb-24!">
          <Outlet />
        </div>
        <BottomNav items={bottomItems} />
      </SidebarInset>
    </SidebarProvider>
  );
}
