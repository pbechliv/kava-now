import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

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

export function useSuperAdminKavas() {
  return useQuery({
    queryKey: ["superadmin", "kavas"],
    queryFn: () => api.get<KavasResponse>("/api/superadmin/kavas"),
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
