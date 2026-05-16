import { useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { useSuperAdminKavas, useDeleteKava } from "@/lib/hooks/use-superadmin-kavas";
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
import { Spinner } from "@/components/spinner";
import { PaginationControls } from "@/components/PaginationControls";

const PAGE_SIZE = 50;

export function KavasPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSuperAdminKavas({ page, pageSize: PAGE_SIZE });
  const deleteMutation = useDeleteKava();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const kavas = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Κάβες</h1>
        <Link to="/superadmin/kavas/new" className="self-start sm:self-auto">
          <Button>+ Νέα κάβα</Button>
        </Link>
      </div>

      {kavas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Δεν υπάρχουν κάβες.</p>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
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
                  {kavas.map((kava) => (
                    <TableRow key={kava.id}>
                      <TableCell className="font-medium">{kava.name}</TableCell>
                      <TableCell className="text-muted-foreground">{kava.slug}</TableCell>
                      <TableCell className="text-muted-foreground">{kava.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(kava.createdAt).toLocaleDateString("el-GR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {confirmId === kava.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-destructive">Σίγουρα;</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() =>
                                deleteMutation.mutate(kava.id, {
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
                            onClick={() => setConfirmId(kava.id)}
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
