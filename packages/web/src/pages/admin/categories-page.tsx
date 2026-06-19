import { useState } from "react";
import { toast } from "sonner";
import type { CategoryWithParentName } from "@kava-now/shared";
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
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { useCategories, useDeleteCategory } from "@/lib/hooks/use-categories";
import { CategoryFormModal } from "@/components/admin/category-form-modal";

export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const deleteMutation = useDeleteCategory();
  const del = useDeleteConfirmation(deleteMutation);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryWithParentName | undefined>(undefined);

  const handleCreate = () => {
    setEditTarget(undefined);
    setModalOpen(true);
  };

  const handleEdit = (cat: CategoryWithParentName) => {
    setEditTarget(cat);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Κατηγορίες</h1>
        <Button onClick={handleCreate} className="self-start sm:self-auto">
          Νέα Κατηγορία
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !categories || categories.length === 0 ? (
        <EmptyState
          message="Δεν υπάρχουν κατηγορίες"
          actionLabel="Νέα Κατηγορία"
          onAction={handleCreate}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
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
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="text-muted-foreground">{cat.parentName ?? "-"}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {cat.sortOrder}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>
                          Επεξεργασία
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => del.request({ id: cat.id, name: cat.name })}
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
            {categories.map((cat) => (
              <MobileListItem key={cat.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{cat.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {cat.parentName ? `Γονική: ${cat.parentName} · ` : ""}Σειρά: {cat.sortOrder}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>
                      Επεξεργασία
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => del.request({ id: cat.id, name: cat.name })}
                    >
                      Διαγραφή
                    </Button>
                  </div>
                </div>
              </MobileListItem>
            ))}
          </MobileList>
        </Card>
      )}

      <CategoryFormModal
        open={modalOpen}
        category={editTarget}
        categories={categories ?? []}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(undefined);
        }}
      />

      <ConfirmDialog
        {...del.dialogProps}
        title="Διαγραφή κατηγορίας"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να διαγράψετε την κατηγορία{" "}
            <span className="font-medium text-foreground">{del.target?.name}</span>; Οι
            υποκατηγορίες της θα μεταφερθούν στο αρχικό επίπεδο.
          </>
        }
        confirmLabel="Διαγραφή"
        onConfirm={() => del.confirm(() => toast.success("Η κατηγορία διαγράφηκε"))}
      />
    </div>
  );
}
