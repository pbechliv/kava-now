import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Tag,
  Users,
  UserCog,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavLink {
  /** Path relative to the tenant admin base (`/k/:slug/admin`). */
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface AdminManageSection extends AdminNavLink {
  /** Shown on the mobile "Διαχείριση" hub. */
  description: string;
  /** Desktop sidebar group this destination belongs to. */
  group: string;
}

// The two daily destinations — their own bottom-nav tabs, and the first desktop
// sidebar group ("Λειτουργία").
export const ADMIN_PRIMARY_NAV: AdminNavLink[] = [
  { path: "dashboard", label: "Πίνακας Ελέγχου", icon: LayoutDashboard },
  { path: "orders", label: "Παραγγελίες", icon: ClipboardList },
];

// Lower-frequency destinations folded behind the mobile "Διαχείριση" hub and
// grouped in the desktop sidebar below "Λειτουργία". Single source of truth for
// the hub page, the sidebar groups, and the hub tab's active-path matching —
// add a destination here and all three stay in sync.
export const ADMIN_MANAGE_SECTIONS: AdminManageSection[] = [
  {
    path: "products",
    label: "Προϊόντα",
    icon: Package,
    group: "Κατάλογος",
    description: "Διαχείριση προϊόντων, τιμών και διαθεσιμότητας",
  },
  {
    path: "categories",
    label: "Κατηγορίες",
    icon: Tag,
    group: "Κατάλογος",
    description: "Οργάνωση του καταλόγου σε κατηγορίες",
  },
  {
    path: "customers",
    label: "Πελάτες",
    icon: Users,
    group: "Πελάτες",
    description: "Πελάτες, χρήστες τους και ειδική τιμολόγηση",
  },
  {
    path: "users",
    label: "Χρήστες",
    icon: UserCog,
    group: "Ομάδα & Ρυθμίσεις",
    description: "Διαχείριση ομάδας και ρόλων",
  },
  {
    path: "settings",
    label: "Ρυθμίσεις",
    icon: Settings,
    group: "Ομάδα & Ρυθμίσεις",
    description: "Ρυθμίσεις λογαριασμού και ειδοποιήσεων",
  },
];

// Desktop sidebar groups: "Λειτουργία" (the primary nav) followed by the manage
// sections grouped by `group`, in first-seen order.
export const ADMIN_NAV_GROUPS: { label: string; items: AdminNavLink[] }[] = [
  { label: "Λειτουργία", items: ADMIN_PRIMARY_NAV },
  ...[...new Set(ADMIN_MANAGE_SECTIONS.map((s) => s.group))].map((group) => ({
    label: group,
    items: ADMIN_MANAGE_SECTIONS.filter((s) => s.group === group),
  })),
];
