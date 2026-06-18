import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryWithParentName,
} from "@kava-now/shared";

type CategoryWithParent = CategoryWithParentName;

export function useCategories() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "categories"],
    queryFn: () => tApi.get<CategoryWithParent[]>("/admin/categories"),
  });
}

export function useCreateCategory() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCategoryInput) => tApi.post<Category>("/admin/categories", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "categories"] });
    },
  });
}

export function useUpdateCategory() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryInput }) =>
      tApi.put<Category>(`/admin/categories/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "categories"] });
    },
  });
}

export function useDeleteCategory() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tApi.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "categories"] });
    },
  });
}
