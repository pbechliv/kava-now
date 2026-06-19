import { useEffect } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCategory, useUpdateCategory } from "@/lib/hooks/use-categories";

interface Props {
  open: boolean;
  /** The category being edited; `undefined` opens the modal in create mode. */
  category?: CategoryWithParentName;
  /** All categories, used to populate the parent picker. */
  categories: CategoryWithParentName[];
  onClose: () => void;
}

export function CategoryFormModal({ open, category, categories, onClose }: Props) {
  const isEdit = !!category;
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();

  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: category?.name ?? "",
      parentId: category?.parentId ?? null,
      sortOrder: category?.sortOrder ?? 0,
    });
  }, [open, category, form]);

  // A category can't be its own parent.
  const parentOptions = categories.filter((c) => c.id !== category?.id);
  const parentItems = [
    { value: "none", label: "Καμία" },
    ...parentOptions.map((c) => ({ value: c.id, label: c.name })),
  ];

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
                  <Select
                    items={parentItems}
                    value={field.value || "none"}
                    onValueChange={(v) => field.onChange(v && v !== "none" ? v : null)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Καμία" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Καμία</SelectItem>
                      {parentOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
