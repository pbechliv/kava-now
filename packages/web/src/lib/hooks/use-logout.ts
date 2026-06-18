import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { authClient } from "../auth-client";
import { deactivateCart } from "../store/cart";

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { slug } = useParams({ strict: false });

  return useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      deactivateCart();
      queryClient.clear();
      void navigate({ to: slug ? `/k/${slug}/login` : "/login", replace: true });
    },
  });
}
