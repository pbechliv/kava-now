import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/api/auth/sign-out"),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });
}
