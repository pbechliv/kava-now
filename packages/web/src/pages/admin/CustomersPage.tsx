import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
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
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/PaginationControls";
import { useCustomers, useDeleteCustomer } from "@/lib/hooks/use-customers";
import { CustomerFormModal } from "@/components/admin/CustomerFormModal";
import { PAGE_SIZE } from "@/lib/constants";

export function CustomersPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useCustomers({
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const deleteMutation = useDeleteCustomer();

  const handleDelete = (id: string, name: string) => {
    deleteMutation.reset();
    setDeleteTarget({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast.success("Ο πελάτης διαγράφηκε");
      },
    });
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditId(undefined);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Πελάτες</h1>
        <Button onClick={handleCreate} className="self-start sm:self-auto">
          Νέος Πελάτης
        </Button>
      </div>

      <SearchInput
        placeholder="Αναζήτηση με όνομα ή υπεύθυνο..."
        value={search}
        onValueChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          message="Δεν βρέθηκαν πελάτες"
          actionLabel="Νέος Πελάτης"
          onAction={handleCreate}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Όνομα</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Τηλέφωνο</TableHead>
                    <TableHead>Υπεύθυνος</TableHead>
                    <TableHead className="text-right">Ενέργειες</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.email ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.phone ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.contactPerson ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(customer.id)}>
                            Επεξεργασία
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`${adminBase}/customers/${customer.id}/users`)}
                          >
                            Χρήστες
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`${adminBase}/customers/${customer.id}/brand-pricing`)
                            }
                          >
                            Τιμολόγηση
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(customer.id, customer.name)}
                          >
                            Διαγραφή
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileList>
              {customers.map((customer) => (
                <MobileListItem key={customer.id}>
                  <div className="min-w-0">
                    <div className="font-medium">{customer.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[customer.email, customer.phone].filter(Boolean).join(" · ") || "-"}
                    </div>
                    {customer.contactPerson && (
                      <div className="text-sm text-muted-foreground">
                        Υπεύθυνος: {customer.contactPerson}
                      </div>
                    )}
                  </div>
                  <div className="-mx-2 flex flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(customer.id)}>
                      Επεξεργασία
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`${adminBase}/customers/${customer.id}/users`)}
                    >
                      Χρήστες
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        navigate(`${adminBase}/customers/${customer.id}/brand-pricing`)
                      }
                    >
                      Τιμολόγηση
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(customer.id, customer.name)}
                    >
                      Διαγραφή
                    </Button>
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

      <CustomerFormModal
        open={modalOpen}
        customerId={editId}
        onClose={() => {
          setModalOpen(false);
          setEditId(undefined);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Διαγραφή πελάτη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να διαγράψετε τον{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>; Οι
            συνδεδεμένοι χρήστες του θα χάσουν την πρόσβασή τους.
          </>
        }
        confirmLabel="Διαγραφή"
        pending={deleteMutation.isPending}
        error={deleteMutation.error?.message}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
