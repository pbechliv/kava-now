import { useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createProductSchema,
  UNIT_LABELS,
  type CreateProductInput,
  type UpdateProductInput,
} from "@kava-now/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/spinner";
import { useProduct, useCreateProduct, useUpdateProduct } from "@/lib/hooks/use-products";
import { useCategories } from "@/lib/hooks/use-categories";

type FormData = CreateProductInput;

export function ProductFormPage() {
  const navigate = useNavigate();
  const { id, slug } = useParams({ strict: false });
  const isEdit = !!id && id !== "new";
  const productsPath = `/k/${slug}/admin/products`;

  const { data: product, isLoading: productLoading } = useProduct(isEdit ? id : undefined);
  const { data: categories } = useCategories();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const form = useForm<FormData>({
    resolver: zodResolver(createProductSchema),
  });

  useEffect(() => {
    if (product && isEdit) {
      form.reset({
        name: product.name,
        brand: product.brand,
        categoryId: product.categoryId,
        description: product.description ?? undefined,
        basePrice: Number(product.basePrice),
        unit: product.unit,
        volumeMl: product.volumeMl,
        alcoholPct: product.alcoholPct != null ? Number(product.alcoholPct) : undefined,
        sku: product.sku ?? undefined,
        erpRef: product.erpRef ?? undefined,
        imageUrl: product.imageUrl,
      });
    }
  }, [product, isEdit, form]);

  const onSubmit = (data: FormData) => {
    const onSuccess = () => {
      toast.success(isEdit ? "Το προϊόν ενημερώθηκε" : "Το προϊόν δημιουργήθηκε");
      void navigate({ to: productsPath });
    };
    if (isEdit) {
      updateMutation.mutate({ id, data: data as UpdateProductInput }, { onSuccess });
    } else {
      createMutation.mutate(data as CreateProductInput, { onSuccess });
    }
  };

  if (isEdit && productLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {isEdit ? "Επεξεργασία Προϊόντος" : "Νέο Προϊόν"}
      </h1>

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Όνομα</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Μάρκα</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Κατηγορία</FormLabel>
                      <Select
                        items={[
                          { value: "none", label: "Χωρίς κατηγορία" },
                          ...(categories ?? []).map((cat) => ({ value: cat.id, label: cat.name })),
                        ]}
                        onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Χωρίς κατηγορία" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Χωρίς κατηγορία</SelectItem>
                          {categories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Τιμή βάσης</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Μονάδα</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.entries(UNIT_LABELS) as [string, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="erpRef"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Κωδικός ERP</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="volumeMl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Όγκος (ml)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alcoholPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Βαθμοί αλκοόλ (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>URL Εικόνας</FormLabel>
                      <FormControl>
                        <Input type="url" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Περιγραφή</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {(createMutation.error || updateMutation.error) && (
                <p className="text-sm text-destructive">
                  {(createMutation.error || updateMutation.error)?.message}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEdit ? "Αποθήκευση" : "Δημιουργία"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: productsPath })}
                >
                  Ακύρωση
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
