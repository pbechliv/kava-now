import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { useCustomers, useDeleteCustomer } from "@/lib/hooks/use-customers";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { CustomerFormModal } from "@/components/admin/customer-form-modal";
import { PAGE_SIZE } from "@/lib/constants";

type CustomerRow = NonNullable<ReturnType<typeof useCustomers>["data"]>["data"][number];

export function CustomersPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useCustomers({
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const deleteMutation = useDeleteCustomer();
  const del = useDeleteConfirmation(deleteMutation);

  const handleEdit = (id: string) => {
    setEditId(id);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditId(undefined);
    setModalOpen(true);
  };

  const columns: ResponsiveTableColumn<CustomerRow>[] = [
    { header: "Όνομα", cellClassName: "font-medium", cell: (c) => c.name },
    { header: "Email", cellClassName: "text-muted-foreground", cell: (c) => c.email ?? "-" },
    { header: "Τηλέφωνο", cellClassName: "text-muted-foreground", cell: (c) => c.phone ?? "-" },
    {
      header: "Υπεύθυνος",
      cellClassName: "text-muted-foreground",
      cell: (c) => c.contactPerson ?? "-",
    },
    {
      header: "Ενέργειες",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (customer) => (
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
            onClick={() => navigate(`${adminBase}/customers/${customer.id}/brand-pricing`)}
          >
            Τιμολόγηση
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => del.request({ id: customer.id, name: customer.name })}
          >
            Διαγραφή
          </Button>
        </div>
      ),
    },
  ];

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
          <ResponsiveTable
            data={customers}
            columns={columns}
            getRowKey={(c) => c.id}
            renderMobileItem={(customer) => (
              <>
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
                    onClick={() => navigate(`${adminBase}/customers/${customer.id}/brand-pricing`)}
                  >
                    Τιμολόγηση
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => del.request({ id: customer.id, name: customer.name })}
                  >
                    Διαγραφή
                  </Button>
                </div>
              </>
            )}
          />
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
        {...del.dialogProps}
        title="Διαγραφή πελάτη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να διαγράψετε τον{" "}
            <span className="font-medium text-foreground">{del.target?.name}</span>; Οι συνδεδεμένοι
            χρήστες του θα χάσουν την πρόσβασή τους.
          </>
        }
        confirmLabel="Διαγραφή"
        onConfirm={() => del.confirm(() => toast.success("Ο πελάτης διαγράφηκε"))}
      />
    </div>
  );
}
