import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";

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
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "settings"],
    queryFn: () => tApi.get<KavaSettings>("/admin/settings"),
  });
}

export function useUpdateSettings() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) => tApi.put<KavaSettings>("/admin/settings", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "settings"] });
    },
  });
}
