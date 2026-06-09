import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/lib/hooks/use-categories";

export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [newNameError, setNewNameError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setNewNameError("Συμπληρώστε το όνομα της κατηγορίας");
      return;
    }
    setNewNameError("");

    createMutation.mutate(
      { name: trimmed, parentId: newParentId || null },
      {
        onSuccess: () => {
          setNewName("");
          setNewParentId("");
        },
      },
    );
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
    updateMutation.mutate(
      {
        id: editingId,
        data: {
          name: editName.trim(),
          parentId: editParentId || null,
          sortOrder: editSortOrder,
        },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Είστε σίγουροι ότι θέλετε να διαγράψετε την κατηγορία "${name}";`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Κατηγορίες</h1>

      <Card className="p-4">
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="cat-name">Νέα κατηγορία</Label>
            <Input
              id="cat-name"
              placeholder="Όνομα κατηγορίας"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (newNameError) setNewNameError("");
              }}
              aria-invalid={!!newNameError}
            />
            {newNameError && <p className="text-sm text-destructive">{newNameError}</p>}
          </div>
          <div className="space-y-2 sm:w-56">
            <Label htmlFor="cat-parent">Γονική κατηγορία</Label>
            <Select
              value={newParentId || "none"}
              onValueChange={(v) => setNewParentId(v === "none" ? "" : v)}
            >
              <SelectTrigger id="cat-parent" className="w-full">
                <SelectValue placeholder="Καμία" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Καμία</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Προσθήκη
          </Button>
        </form>
      </Card>

      {deleteMutation.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {deleteMutation.error.message}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !categories || categories.length === 0 ? (
        <EmptyState message="Δεν υπάρχουν κατηγορίες" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Όνομα</TableHead>
                  <TableHead>Γονική</TableHead>
                  <TableHead className="text-center">Σειρά</TableHead>
                  <TableHead className="text-right">Ενέργειες</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    {editingId === cat.id ? (
                      <>
                        <TableCell>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={editParentId || "none"}
                            onValueChange={(v) => setEditParentId(v === "none" ? "" : v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Καμία" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Καμία</SelectItem>
                              {categories
                                .filter((c) => c.id !== cat.id)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            value={editSortOrder}
                            onChange={(e) => setEditSortOrder(Number(e.target.value))}
                            className="mx-auto w-20 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={handleUpdate}
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              Αποθήκευση
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                              Ακύρωση
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {cat.parentName ?? "-"}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {cat.sortOrder}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(cat)}>
                              Επεξεργασία
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDelete(cat.id, cat.name)}
                            >
                              Διαγραφή
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
