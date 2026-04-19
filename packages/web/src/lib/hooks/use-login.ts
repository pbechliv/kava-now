import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../api";
import type { LoginInput } from "@kava-now/shared";
import type { AuthMeResponse } from "./use-auth";

interface LoginResult {
  magicLinkSent: boolean;
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation<LoginResult, Error, LoginInput>({
    mutationFn: async (data) => {
      if (data.password) {
        await api.post("/api/auth/sign-in/email", {
          email: data.email,
          password: data.password,
        });
        return { magicLinkSent: false };
      }
      await api.post("/api/auth/sign-in/magic-link", {
        email: data.email,
        callbackURL: "/",
      });
      return { magicLinkSent: true };
    },
    onSuccess: async (result) => {
      if (result.magicLinkSent) return;

      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      const me = await queryClient.fetchQuery<AuthMeResponse>({
        queryKey: ["auth"],
        queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
      });
      const role = me.user?.role;
      if (role === "superadmin") navigate("/superadmin/kavas", { replace: true });
      else if (role === "owner" || role === "staff")
        navigate("/admin/dashboard", { replace: true });
      else if (role === "customer") navigate("/catalog", { replace: true });
    },
  });
}
