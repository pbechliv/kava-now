import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type { PageOnlySearch } from "@kava-now/shared";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { useSuperAdminTenants, useDeleteTenant } from "@/lib/hooks/use-superadmin-tenants";
import { Button } from "@/components/ui/button";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type TenantRow = NonNullable<ReturnType<typeof useSuperAdminTenants>["data"]>["data"][number];

export function TenantsPage() {
  const { search, setFilters } = useFilterSearch<PageOnlySearch>();
  const page = search.page ?? 1;
  const { data, isLoading } = useSuperAdminTenants({ page, pageSize: PAGE_SIZE });
  const deleteMutation = useDeleteTenant();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const tenants = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: ResponsiveTableColumn<TenantRow>[] = [
    { header: "Όνομα", cellClassName: "font-medium", cell: (tenant) => tenant.name },
    { header: "Slug", cellClassName: "text-muted-foreground", cell: (tenant) => tenant.slug },
    { header: "Email", cellClassName: "text-muted-foreground", cell: (tenant) => tenant.email },
    {
      header: "Ημ/νία",
      cellClassName: "text-muted-foreground",
      cell: (tenant) => formatDate(tenant.createdAt),
    },
    {
      header: undefined,
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (tenant) =>
        confirmId === tenant.id ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-destructive">Σίγουρα;</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteMutation.mutate(tenant.id, {
                  onSuccess: () => setConfirmId(null),
                })
              }
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ναι
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
              Όχι
            </Button>
          </div>
        ) : (
          <Button variant="ghost-destructive" size="sm" onClick={() => setConfirmId(tenant.id)}>
            Διαγραφή
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Λογαριασμοί</h1>
        <Link to="/admin/tenants/new" className="self-start sm:self-auto">
          <Button>+ Νέος λογαριασμός</Button>
        </Link>
      </div>

      {tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Δεν υπάρχουν λογαριασμοί.</p>
      ) : (
        <>
          <ResponsiveTable
            data={tenants}
            columns={columns}
            getRowKey={(t) => t.id}
            renderMobileItem={(tenant) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{tenant.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {tenant.slug} · {tenant.email}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(tenant.createdAt)}
                  </div>
                </div>
                <div className="shrink-0">
                  {confirmId === tenant.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive">Σίγουρα;</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() =>
                          deleteMutation.mutate(tenant.id, {
                            onSuccess: () => setConfirmId(null),
                          })
                        }
                      >
                        {deleteMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Ναι
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                        Όχι
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost-destructive"
                      size="sm"
                      onClick={() => setConfirmId(tenant.id)}
                    >
                      Διαγραφή
                    </Button>
                  )}
                </div>
              </div>
            )}
          />
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}
    </div>
  );
}
