import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { User, Kava } from "@kava-now/shared";

interface AuthMeResponse {
  user: User;
  kava: Kava;
}

export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    retry: false,
  });

  return {
    user: data?.user ?? null,
    kava: data?.kava ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
  };
}
