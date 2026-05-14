import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface KavaSettings {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string;
  notificationEmails: string[];
  logoUrl: string | null;
}

export interface UpdateSettingsInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string;
  notificationEmails?: string[];
  logoUrl?: string | null;
}

export function useSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<KavaSettings>("/api/admin/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) => api.put<KavaSettings>("/api/admin/settings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });
}
