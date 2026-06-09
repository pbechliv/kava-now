import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  // Global safety net (#50): a failed mutation must never look like a no-op —
  // half the admin pages render no inline mutation error, so 409s like
  // CUSTOMER_HAS_ORDERS or ORDER_LOCKED_BY_ERP silently died. error.message
  // is already localized by api.ts (translateApiErrorCode). Pages with inline
  // error UI keep it; mutations that handle errors fully themselves can opt
  // out with meta: { suppressErrorToast: true }.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.suppressErrorToast) return;
      toast.error(error instanceof Error ? error.message : "Κάτι πήγε στραβά");
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});
