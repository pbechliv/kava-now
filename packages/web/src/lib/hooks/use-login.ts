import { useMutation } from "@tanstack/react-query";
import { api } from "../api";

interface LoginResponse {
  success: boolean;
  message: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string }) =>
      api.post<LoginResponse>("/api/auth/login", data),
  });
}
