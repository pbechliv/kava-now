import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantApi, useTenantSlug } from "./use-tenant-api";
import type { TenantSettingsResponse, UpdateTenantSettingsInput } from "@kava-now/shared";

// Local aliases for the historical names used by the settings page.
export type TenantSettings = TenantSettingsResponse;
export type UpdateSettingsInput = UpdateTenantSettingsInput;

export function useSettings() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  return useQuery({
    queryKey: ["admin", slug, "settings"],
    queryFn: () => tApi.get<TenantSettings>("/admin/settings"),
  });
}

export function useUpdateSettings() {
  const slug = useTenantSlug();
  const tApi = useTenantApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) => tApi.put<TenantSettings>("/admin/settings", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", slug, "settings"] });
    },
  });
}
