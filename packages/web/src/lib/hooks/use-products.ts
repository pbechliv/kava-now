import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
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

export function useProducts(filters?: ProductFilters) {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.active) params.set("active", filters.active);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  const qs = params.toString();
  const path = `/api/admin/products${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "products", filters],
    queryFn: () => api.get<PaginatedResponse<ProductWithCategory>>(path),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "products", id],
    queryFn: () => api.get<ProductWithCategory>(`/api/admin/products/${id}`),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductInput) => api.post<Product>("/api/admin/products", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductInput }) =>
      api.put<Product>(`/api/admin/products/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useImportProducts() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (rows: ImportProductRow[]) =>
      api.post<ImportProductsResult>("/api/admin/products/import", { rows }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}
