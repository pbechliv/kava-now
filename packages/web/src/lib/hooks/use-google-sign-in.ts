import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import type { CredentialResponse } from "@react-oauth/google";
import { api } from "../api";
import { authClient } from "../auth-client";
import { getUserHomePath } from "../auth-home";
import type { AuthMeResponse } from "./use-auth";

export function useGoogleSignIn() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  return useMutation<void, Error, CredentialResponse>({
    mutationFn: async ({ credential }) => {
      if (!credential) throw new Error("Δεν λήφθηκε token από Google");
      const { error } = await authClient.signIn.social({
        provider: "google",
        idToken: { token: credential },
      });
      if (error) {
        // The invite-only hook on the server rejects unknown emails with a
        // generic better-auth error. Show a clear, action-oriented message
        // regardless of what better-auth returns.
        throw new Error(
          "Δεν βρέθηκε λογαριασμός με αυτό το email στο KavaNow. Επικοινωνήστε με τον διαχειριστή για πρόσκληση.",
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      const me = await queryClient.fetchQuery<AuthMeResponse>({
        queryKey: ["auth"],
        queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
      });
      if (me.user) {
        void navigate(getUserHomePath(me.user, me.memberships, slug ?? null), { replace: true });
      }
    },
  });
}
