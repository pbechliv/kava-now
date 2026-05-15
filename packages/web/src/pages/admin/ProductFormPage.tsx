import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProductSchema,
  UNIT_LABELS,
  type CreateProductInput,
  type UpdateProductInput,
} from "@kava-now/shared";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { useProduct, useCreateProduct, useUpdateProduct } from "../../lib/hooks/use-products";
import { useCategories } from "../../lib/hooks/use-categories";

type FormData = CreateProductInput;

export function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id && id !== "new";

  const { data: product, isLoading: productLoading } = useProduct(isEdit ? id : undefined);
  const { data: categories } = useCategories();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(createProductSchema),
  });

  useEffect(() => {
    if (product && isEdit) {
      reset({
        name: product.name,
        brand: product.brand,
        categoryId: product.categoryId,
        description: product.description ?? undefined,
        basePrice: Number(product.basePrice),
        unit: product.unit,
        volumeMl: product.volumeMl,
        alcoholPct: product.alcoholPct != null ? Number(product.alcoholPct) : undefined,
        sku: product.sku ?? undefined,
        imageUrl: product.imageUrl,
      });
    }
  }, [product, isEdit, reset]);

  const onSubmit = async (data: FormData) => {
    if (isEdit) {
      await updateMutation.mutateAsync({ id, data: data as UpdateProductInput });
    } else {
      await createMutation.mutateAsync(data as CreateProductInput);
    }
    void navigate("/admin/products");
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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? "Επεξεργασία Προϊόντος" : "Νέο Προϊόν"}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 max-w-2xl space-y-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Input label="Όνομα *" id="name" {...register("name")} error={errors.name?.message} />

          <Input label="Μάρκα *" id="brand" {...register("brand")} error={errors.brand?.message} />

          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700 mb-1">
              Κατηγορία
            </label>
            <select
              id="categoryId"
              {...register("categoryId")}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Χωρίς κατηγορία</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Τιμή βάσης *"
            id="basePrice"
            type="number"
            step="0.01"
            min="0.01"
            {...register("basePrice", { valueAsNumber: true })}
            error={errors.basePrice?.message}
          />

          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">
              Μονάδα
            </label>
            <select
              id="unit"
              {...register("unit")}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {(Object.entries(UNIT_LABELS) as [string, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Input label="SKU" id="sku" {...register("sku")} error={errors.sku?.message} />

          <Input
            label="Όγκος (ml)"
            id="volumeMl"
            type="number"
            {...register("volumeMl", { valueAsNumber: true })}
            error={errors.volumeMl?.message}
          />

          <Input
            label="Βαθμοί αλκοόλ (%)"
            id="alcoholPct"
            type="number"
            step="0.1"
            {...register("alcoholPct", { valueAsNumber: true })}
            error={errors.alcoholPct?.message}
          />

          <div className="sm:col-span-2">
            <Input
              label="URL Εικόνας"
              id="imageUrl"
              type="url"
              {...register("imageUrl")}
              error={errors.imageUrl?.message}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Περιγραφή
            </label>
            <textarea
              id="description"
              rows={3}
              {...register("description")}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {(createMutation.error || updateMutation.error) && (
          <p className="text-sm text-red-600">
            {(createMutation.error || updateMutation.error)?.message}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" loading={isPending}>
            {isEdit ? "Αποθήκευση" : "Δημιουργία"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate("/admin/products")}>
            Ακύρωση
          </Button>
        </div>
      </form>
    </div>
  );
}
