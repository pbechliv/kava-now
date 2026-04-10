import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "../../lib/hooks/use-categories";

export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    await createMutation.mutateAsync({
      name: newName.trim(),
      parentId: newParentId || null,
    });
    setNewName("");
    setNewParentId("");
  };

  const startEdit = (cat: {
    id: string;
    name: string;
    parentId: string | null;
    sortOrder: number;
  }) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditParentId(cat.parentId ?? "");
    setEditSortOrder(cat.sortOrder);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    await updateMutation.mutateAsync({
      id: editingId,
      data: {
        name: editName.trim(),
        parentId: editParentId || null,
        sortOrder: editSortOrder,
      },
    });
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Είστε σίγουροι ότι θέλετε να διαγράψετε την κατηγορία "${name}";`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Κατηγορίες</h1>

      {/* Inline add form */}
      <form
        onSubmit={handleCreate}
        className="mt-4 flex items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <Input
            label="Νέα κατηγορία"
            placeholder="Όνομα κατηγορίας"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Γονική κατηγορία
          </label>
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Καμία</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={createMutation.isPending}>
          Προσθήκη
        </Button>
      </form>

      {/* Error messages */}
      {deleteMutation.error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {deleteMutation.error.message}
        </div>
      )}

      {/* Category list */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !categories || categories.length === 0 ? (
          <EmptyState message="Δεν υπάρχουν κατηγορίες" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Όνομα</th>
                  <th className="px-4 py-3 font-medium">Γονική</th>
                  <th className="px-4 py-3 font-medium text-center">Σειρά</th>
                  <th className="px-4 py-3 font-medium text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b last:border-0 hover:bg-gray-50">
                    {editingId === cat.id ? (
                      <>
                        <td className="px-4 py-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editParentId}
                            onChange={(e) => setEditParentId(e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">Καμία</option>
                            {categories
                              .filter((c) => c.id !== cat.id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            value={editSortOrder}
                            onChange={(e) =>
                              setEditSortOrder(Number(e.target.value))
                            }
                            className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
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
                              onClick={() => setEditingId(null)}
                            >
                              Ακύρωση
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {cat.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {cat.parentName ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {cat.sortOrder}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(cat)}
                            >
                              Επεξεργασία
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(cat.id, cat.name)}
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
    </div>
  );
}
