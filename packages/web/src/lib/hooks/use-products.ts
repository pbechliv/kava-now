import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ImportProductRow,
  ImportProductsResult,
  PaginatedResponse,
} from "@kava-now/shared";

interface ProductWithCategory extends Product {
  categoryName: string | null;
}

interface ProductFilters {
  categoryId?: string;
  search?: string;
  active?: "true" | "false";
  page?: number;
  pageSize?: number;
}

export interface ProductKey {
  name: string;
  brand: string;
}

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
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.active) params.set("active", filters.active);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/admin/products${qs ? `?${qs}` : ""}`;

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
