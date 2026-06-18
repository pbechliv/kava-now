import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ImportProductRow,
  ImportProductsResult,
  ProductWithCategoryName,
  ProductNameBrandKey,
  AdminProductsSearch,
  PaginatedResponse,
} from "@kava-now/shared";

type ProductWithCategory = ProductWithCategoryName;
// Local alias for the historical name used by the import preview page.
export type ProductKey = ProductNameBrandKey;

type ProductFilters = AdminProductsSearch & { pageSize?: number };

/** All (name, brand) pairs — unpaginated, for the import preview (#61). */
export function useProductKeys() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "products", "keys"],
    queryFn: () => tApi.get<ProductKey[]>("/admin/products/keys"),
  });
}

export function useProducts(filters?: ProductFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/admin/products", filters);

  return useQuery({
    queryKey: ["admin", slug, "products", filters],
    queryFn: () => tApi.get<PaginatedResponse<ProductWithCategory>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "products", id],
    queryFn: () => tApi.get<ProductWithCategory>(`/admin/products/${id}`),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductInput) => tApi.post<Product>("/admin/products", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "products"] });
    },
  });
}

export function useUpdateProduct() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductInput }) =>
      tApi.put<Product>(`/admin/products/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "products"] });
    },
  });
}

export function useDeleteProduct() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    // `product` is present when the API soft-deleted (deactivated) instead —
    // the product is referenced by order history.
    mutationFn: (id: string) =>
      tApi.delete<{ success: boolean; product?: Product }>(`/admin/products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "products"] });
    },
  });
}

export function useImportProducts() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (rows: ImportProductRow[]) =>
      tApi.post<ImportProductsResult>("/admin/products/import", { rows }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "products"] });
      void qc.invalidateQueries({ queryKey: ["admin", slug, "categories"] });
    },
  });
}
