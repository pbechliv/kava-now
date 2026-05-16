import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/empty-state";
import { useCustomers, useDeleteCustomer } from "@/lib/hooks/use-customers";
import { CustomerFormModal } from "./CustomerFormModal";

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);

  const { data: customers, isLoading } = useCustomers(search || undefined);
  const deleteMutation = useDeleteCustomer();

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Είστε σίγουροι ότι θέλετε να διαγράψετε τον "${name}";`)) {
      deleteMutation.mutate(id);
    }
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

      <Input
        placeholder="Αναζήτηση με όνομα ή υπεύθυνο..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !customers || customers.length === 0 ? (
        <EmptyState
          message="Δεν βρέθηκαν πελάτες"
          actionLabel="Νέος Πελάτης"
          onAction={handleCreate}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
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
                    <TableCell className="text-muted-foreground">{customer.email ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.phone ?? "-"}</TableCell>
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
                          onClick={() => navigate(`/admin/customers/${customer.id}/users`)}
                        >
                          Χρήστες
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/customers/${customer.id}/brand-pricing`)}
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
        </Card>
      )}

      <CustomerFormModal
        open={modalOpen}
        customerId={editId}
        onClose={() => {
          setModalOpen(false);
          setEditId(undefined);
        }}
      />
    </div>
  );
}
