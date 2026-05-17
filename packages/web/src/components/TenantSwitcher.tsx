import { useNavigate } from "react-router";
import { Building2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/hooks/use-auth";
import { membershipHome } from "@/lib/auth-home";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Renders the tenant switcher section inside a user dropdown. Lists every tenant
 * the user is a member of (excluding the one they're currently in), plus an
 * "Admin" entry for superadmins not already on the platform admin pages.
 *
 * Returns null if there's nothing to switch to.
 */
export function TenantSwitcher({ currentSlug }: { currentSlug: string | null }) {
  const navigate = useNavigate();
  const { user, memberships } = useAuth();

  const onPlatformAdmin = currentSlug === null;
  const otherMemberships = memberships.filter((m) => m.tenantSlug !== currentSlug);
  const showAdminLink = !!user?.isSuperAdmin && !onPlatformAdmin;

  if (!showAdminLink && otherMemberships.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Εναλλαγή
      </DropdownMenuLabel>
      {showAdminLink && (
        <DropdownMenuItem onSelect={() => navigate("/admin/tenants")}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Admin
        </DropdownMenuItem>
      )}
      {otherMemberships.map((m) => (
        <DropdownMenuItem key={m.tenantId} onSelect={() => navigate(membershipHome(m))}>
          <Building2 className="mr-2 h-4 w-4" />
          <span className="flex-1 truncate">{m.tenantName}</span>
          <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
        </DropdownMenuItem>
      ))}
    </>
  );
}
