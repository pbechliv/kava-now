import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import {
  usePricingTiers,
  useCreatePricingTier,
  useUpdatePricingTier,
  useDeletePricingTier,
} from "../../lib/hooks/use-pricing-tiers";

interface EditState {
  id: string;
  name: string;
  discountPct: string;
}

export function PricingPage() {
  const { data: tiers, isLoading } = usePricingTiers();
  const createMutation = useCreatePricingTier();
  const updateMutation = useUpdatePricingTier();
  const deleteMutation = useDeletePricingTier();

  // Inline create form
  const [newName, setNewName] = useState("");
  const [newDiscount, setNewDiscount] = useState("");

  // Inline edit
  const [editing, setEditing] = useState<EditState | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || !newDiscount) return;
    await createMutation.mutateAsync({
      name: newName.trim(),
      discountPct: Number(newDiscount),
    });
    setNewName("");
    setNewDiscount("");
  };

  const handleUpdate = async () => {
    if (!editing) return;
    await updateMutation.mutateAsync({
      id: editing.id,
      data: {
        name: editing.name.trim() || undefined,
        discountPct: editing.discountPct
          ? Number(editing.discountPct)
          : undefined,
      },
    });
    setEditing(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (
      confirm(
        `Είστε σίγουροι ότι θέλετε να διαγράψετε τον τιμοκατάλογο "${name}";`,
      )
    ) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Τιμοκατάλογοι</h1>

      {/* Inline create form */}
      <div className="mt-6 flex items-end gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex-1">
          <Input
            label="Όνομα"
            id="new-tier-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="π.χ. Χονδρική"
          />
        </div>
        <div className="w-32">
          <Input
            label="Έκπτωση %"
            id="new-tier-discount"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={newDiscount}
            onChange={(e) => setNewDiscount(e.target.value)}
            placeholder="0"
          />
        </div>
        <Button
          onClick={handleCreate}
          loading={createMutation.isPending}
          disabled={!newName.trim() || !newDiscount}
        >
          Προσθήκη
        </Button>
      </div>

      {createMutation.error && (
        <p className="mt-2 text-sm text-red-600">
          {createMutation.error.message}
        </p>
      )}

      {/* Tier list */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !tiers || tiers.length === 0 ? (
          <EmptyState message="Δεν υπάρχουν τιμοκατάλογοι" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Όνομα</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Έκπτωση %
                  </th>
                  <th className="px-4 py-3 font-medium text-center">
                    Πελάτες
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Ενέργειες
                  </th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr
                    key={tier.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    {editing?.id === tier.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            value={editing.name}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                name: e.target.value,
                              })
                            }
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={editing.discountPct}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                discountPct: e.target.value,
                              })
                            }
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge color="blue">{tier.customerCount}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={handleUpdate}
                              loading={updateMutation.isPending}
                            >
                              Αποθήκευση
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(null)}
                            >
                              Ακύρωση
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {tier.name}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {Number(tier.discountPct)}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge color="blue">{tier.customerCount}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setEditing({
                                  id: tier.id,
                                  name: tier.name,
                                  discountPct: String(
                                    Number(tier.discountPct),
                                  ),
                                })
                              }
                            >
                              Επεξεργασία
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() =>
                                handleDelete(tier.id, tier.name)
                              }
                            >
                              Διαγραφή
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(updateMutation.error || deleteMutation.error) && (
        <p className="mt-4 text-sm text-red-600">
          {(updateMutation.error || deleteMutation.error)?.message}
        </p>
      )}
    </div>
  );
}
