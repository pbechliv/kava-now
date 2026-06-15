import { Link, useParams } from "react-router";
import { ChevronRight } from "lucide-react";
import { ADMIN_MANAGE_SECTIONS } from "@/lib/admin-nav";

/**
 * Mobile "Διαχείριση" hub — folds the lower-frequency admin destinations
 * (products, categories, customers, users, settings) behind a single bottom-nav
 * tab. On desktop these live directly in the sidebar, so this page is reached
 * only via the mobile bar (though it renders fine at any width). Sections come
 * from the shared ADMIN_MANAGE_SECTIONS so the hub, sidebar, and active-tab
 * matching can't drift apart.
 */
export function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const base = `/k/${slug}/admin`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Διαχείριση</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {ADMIN_MANAGE_SECTIONS.map((section) => (
          <Link
            key={section.path}
            to={`${base}/${section.path}`}
            className="flex min-w-0 items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <section.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{section.label}</h2>
              <p className="truncate text-sm text-muted-foreground">{section.description}</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
