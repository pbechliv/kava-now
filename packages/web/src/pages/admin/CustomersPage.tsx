import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import {
  useCustomers,
  useDeleteCustomer,
} from "../../lib/hooks/use-customers";
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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Πελάτες</h1>
        <Button onClick={handleCreate}>Νέος Πελάτης</Button>
      </div>

      {/* Search */}
      <div className="mt-4">
        <Input
          placeholder="Αναζήτηση με όνομα ή υπεύθυνο..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="mt-6">
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
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Όνομα</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Τηλέφωνο</th>
                  <th className="px-4 py-3 font-medium">Υπεύθυνος</th>
                  <th className="px-4 py-3 font-medium">Τιμοκατάλογος</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Ενέργειες
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.email ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.phone ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.contactPerson ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {customer.pricingTierName ? (
                        <Badge color="amber">{customer.pricingTierName}</Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(customer.id)}
                        >
                          Επεξεργασία
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/admin/customers/${customer.id}/products`,
                            )
                          }
                        >
                          Προϊόντα
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            handleDelete(customer.id, customer.name)
                          }
                        >
                          Διαγραφή
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
