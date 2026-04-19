import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { RegisterInput } from "@kava-now/shared";

interface KavaListItem {
  id: string;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
}

interface KavasResponse {
  kavas: KavaListItem[];
}

interface CreateKavaResponse {
  success: boolean;
  slug: string;
  hasPassword: boolean;
}

export function useSuperAdminKavas() {
  return useQuery({
    queryKey: ["superadmin", "kavas"],
    queryFn: () => api.get<KavasResponse>("/api/superadmin/kavas"),
  });
}

export function useCreateKava() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterInput) =>
      api.post<CreateKavaResponse>("/api/superadmin/kavas", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "kavas"] });
    },
  });
}

export function useDeleteKava() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/superadmin/kavas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "kavas"] });
    },
  });
}
