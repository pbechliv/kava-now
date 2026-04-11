import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../api";
import type { LoginInput } from "@kava-now/shared";

interface LoginResponse {
  success: boolean;
  redirect?: string;
  user?: { id: string; email: string; name: string; role: string };
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginInput) =>
      api.post<LoginResponse>("/api/auth/login", data),
    onSuccess: (data) => {
      if (data.redirect) {
        queryClient.invalidateQueries({ queryKey: ["auth"] });
        navigate(data.redirect, { replace: true });
      }
    },
  });
}
