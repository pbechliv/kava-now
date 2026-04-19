import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Customer } from "@kava-now/shared";

export function useProfile() {
  return useQuery({
    queryKey: ["customer", "profile"],
    queryFn: () => api.get<Customer>("/api/customer/profile"),
  });
}

export interface UpdateProfileInput {
  phone?: string | null;
  address?: string | null;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api.patch<Customer>("/api/customer/profile", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "profile"] });
    },
  });
}
