import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Kava, UserRole } from "@kava-now/shared";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hasPassword: boolean;
}

export interface AuthMeResponse {
  user: AuthUser;
  kava: Kava | null;
}

export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth"],
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
