import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../api";
import { authClient } from "../auth-client";
import { authEmailFor } from "../auth-email";
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
      // Encode the email with the current subdomain so better-auth's globally
      // unique `email` lookup finds the right tenant user.
      const authEmail = authEmailFor(data.email);
      if (data.password) {
        const { error } = await authClient.signIn.email({
          email: authEmail,
          password: data.password,
        });
        if (error) throw new Error(error.message ?? "Λάθος email ή κωδικός");
        return { magicLinkSent: false };
      }
      const { error } = await authClient.signIn.magicLink({
        email: authEmail,
        // Absolute URL so better-auth keeps the subdomain in the post-verify
        // redirect (its static baseURL would otherwise drop it).
        callbackURL: `${window.location.origin}/`,
      });
      if (error) throw new Error(error.message ?? "Σφάλμα");
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
