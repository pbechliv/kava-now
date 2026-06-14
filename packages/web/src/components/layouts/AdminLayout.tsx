import { NavLink, Outlet, useParams } from "react-router";
import { initials } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Tag,
  Users,
  UserCog,
  ClipboardList,
  Settings,
  LogOut,
} from "lucide-react";
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
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { Logo } from "@/components/Logo";

export function AdminLayout() {
  const { user, tenant } = useAuth();
  const logout = useLogout();
  const { slug } = useParams<{ slug: string }>();
  const base = `/k/${slug}/admin`;

  const navItems = [
    { to: `${base}/orders`, label: "Παραγγελίες", icon: ClipboardList },
    { to: `${base}/dashboard`, label: "Πίνακας Ελέγχου", icon: LayoutDashboard },
    { to: `${base}/products`, label: "Προϊόντα", icon: Package },
    { to: `${base}/categories`, label: "Κατηγορίες", icon: Tag },
    { to: `${base}/customers`, label: "Πελάτες", icon: Users },
    { to: `${base}/users`, label: "Χρήστες", icon: UserCog },
    { to: `${base}/settings`, label: "Ρυθμίσεις", icon: Settings },
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
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.to}>
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
