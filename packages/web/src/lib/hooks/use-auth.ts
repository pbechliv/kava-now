import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Kava, UserRole } from "@kava-now/shared";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hasPassword: boolean;
}

interface AuthMeResponse {
  user: AuthUser;
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
