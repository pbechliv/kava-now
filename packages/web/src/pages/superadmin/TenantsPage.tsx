import { useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { useSuperAdminTenants, useDeleteTenant } from "@/lib/hooks/use-superadmin-tenants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Spinner } from "@/components/spinner";
import { PaginationControls } from "@/components/PaginationControls";

const PAGE_SIZE = 50;

export function TenantsPage() {
  const [page, setPage] = useState(1);
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
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Όνομα</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ημ/νία</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                      <TableCell className="text-muted-foreground">{tenant.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(tenant.createdAt).toLocaleDateString("el-GR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {confirmId === tenant.id ? (
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
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setConfirmId(tenant.id)}
                          >
                            Διαγραφή
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileList>
              {tenants.map((tenant) => (
                <MobileListItem key={tenant.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{tenant.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {tenant.slug} · {tenant.email}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(tenant.createdAt).toLocaleDateString("el-GR")}
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
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirmId(tenant.id)}
                        >
                          Διαγραφή
                        </Button>
                      )}
                    </div>
                  </div>
                </MobileListItem>
              ))}
            </MobileList>
          </Card>
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
