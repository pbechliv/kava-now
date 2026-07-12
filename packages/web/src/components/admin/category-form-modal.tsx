import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCategorySchema,
  type CreateCategoryInput,
  type CategoryWithParentName,
} from "@kava-now/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  CategoryPickerCombobox,
  type CategoryPickerValue,
} from "@/components/admin/category-picker-combobox";
import { useCreateCategory, useUpdateCategory } from "@/lib/hooks/use-categories";

interface Props {
  open: boolean;
  /** The category being edited; `undefined` opens the modal in create mode. */
  category?: CategoryWithParentName;
  onClose: () => void;
}

export function CategoryFormModal({ open, category, onClose }: Props) {
  const isEdit = !!category;
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  // The picker needs the parent's name for its label; the form field holds only
  // the id, so mirror the selection here (seeded from the category on edit).
  const [parentSel, setParentSel] = useState<CategoryPickerValue | null>(null);

  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
  });

  useEffect(() => {
    if (!open) return;
    setParentSel(
      category?.parentId ? { id: category.parentId, name: category.parentName ?? "" } : null,
    );
    form.reset({
      name: category?.name ?? "",
      parentId: category?.parentId ?? null,
      sortOrder: category?.sortOrder ?? 0,
    });
  }, [open, category, form]);

  const onSubmit = (data: CreateCategoryInput) => {
    const payload = {
      name: data.name.trim(),
      parentId: data.parentId || null,
      ...(isEdit ? { sortOrder: data.sortOrder ?? 0 } : {}),
    };

    if (category) {
      updateMutation.mutate(
        { id: category.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Η κατηγορία ενημερώθηκε");
            onClose();
          },
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success("Η κατηγορία δημιουργήθηκε");
          onClose();
        },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Επεξεργασία Κατηγορίας" : "Νέα Κατηγορία"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Όνομα</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Γονική κατηγορία</FormLabel>
                  <FormControl>
                    <CategoryPickerCombobox
                      placeholder="Καμία"
                      selected={parentSel}
                      excludeId={category?.id}
                      onSelect={(parent) => {
                        setParentSel(parent);
                        field.onChange(parent?.id ?? null);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit && (
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Σειρά</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-24"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {error && <p className="text-sm text-destructive">{error.message}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Ακύρωση
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Αποθήκευση" : "Δημιουργία"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
