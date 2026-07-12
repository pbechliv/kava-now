import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import { withQuery } from "../utils";
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryWithParentName,
  PageOnlySearch,
  PaginatedResponse,
} from "@kava-now/shared";

type CategoryWithParent = CategoryWithParentName;

// Every category in the tenant (no pagination) — feeds the category dropdowns
// in the products filter and the product/category forms, which need all options.
export function useCategories() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "categories"],
    queryFn: () =>
      tApi.get<PaginatedResponse<CategoryWithParent>>("/admin/categories").then((r) => r.data),
  });
}

type CategoryFilters = PageOnlySearch & { pageSize?: number };

// Paginated slice for the admin categories list view.
export function useCategoriesList(filters?: CategoryFilters) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const path = withQuery("/admin/categories", filters);
  return useQuery({
    queryKey: ["admin", slug, "categories", "list", filters],
    queryFn: () => tApi.get<PaginatedResponse<CategoryWithParent>>(path),
    placeholderData: keepPreviousData,
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
