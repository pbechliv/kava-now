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

type CategoryFilters = PageOnlySearch & { search?: string; pageSize?: number };

// Paginated categories — the admin list view (page/pageSize) and the category
// picker combobox (server-side `search`) both read from here. No fetch-all
// variant exists; every consumer paginates.
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

// One category by id — lets the picker resolve a selected id back to its label
// (e.g. a bookmarked products filter) without loading the whole list.
export function useCategory(id: string | undefined) {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "categories", id],
    queryFn: () => tApi.get<CategoryWithParent>(`/admin/categories/${id}`),
    enabled: !!id,
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
