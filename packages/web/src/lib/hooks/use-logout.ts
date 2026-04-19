import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });
}
