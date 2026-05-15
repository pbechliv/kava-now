import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@kava-now/shared";

interface CategoryWithParent extends Category {
  parentName: string | null;
}

export function useCategories() {
  return useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api.get<CategoryWithParent[]>("/api/admin/categories"),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCategoryInput) => api.post<Category>("/api/admin/categories", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryInput }) =>
      api.put<Category>(`/api/admin/categories/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/categories/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });
}
