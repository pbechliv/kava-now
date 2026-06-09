import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { authClient } from "../auth-client";
import { getUserHomePath, returnPathFromState } from "../auth-home";
import type { LoginInput } from "@kava-now/shared";
import type { AuthMeResponse } from "./use-auth";

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();

  return useMutation<void, Error, LoginInput>({
    // LoginPage always renders this error inline — skip the global toast.
    meta: { suppressErrorToast: true },
    mutationFn: async (data) => {
      const { error } = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });
      if (error) throw new Error(error.message ?? "Λάθος email ή κωδικός");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      const me = await queryClient.fetchQuery<AuthMeResponse>({
        queryKey: ["auth"],
        queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
      });
      if (me.user) {
        // Honor the deep link RequireAuth stashed before bouncing here (#62).
        const returnTo = returnPathFromState(location.state);
        void navigate(returnTo ?? getUserHomePath(me.user, me.memberships, slug ?? null), {
          replace: true,
        });
      }
    },
  });
}
