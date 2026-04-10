import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Product, CreateProductInput, UpdateProductInput } from "@kava-now/shared";

interface ProductWithCategory extends Product {
  categoryName: string | null;
}

interface ProductFilters {
  categoryId?: string;
  search?: string;
  active?: "true" | "false";
}

export function useProducts(filters?: ProductFilters) {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.active) params.set("active", filters.active);

  const qs = params.toString();
  const path = `/api/admin/products${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: ["admin", "products", filters],
    queryFn: () => api.get<ProductWithCategory[]>(path),
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
    mutationFn: (data: CreateProductInput) =>
      api.post<Product>("/api/admin/products", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductInput }) =>
      api.put<Product>(`/api/admin/products/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}
