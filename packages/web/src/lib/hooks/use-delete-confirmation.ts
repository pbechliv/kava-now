import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

export interface DeleteTarget {
  id: string;
  name: string;
}

// Drives the "click delete → confirm in a dialog → run the mutation" flow that
// every admin list page repeats. Pass the delete mutation; spread `dialogProps`
// into a `ConfirmDialog` and supply your own title/description/confirmLabel.
export function useDeleteConfirmation<TData>(
  mutation: Pick<
    UseMutationResult<TData, Error, string, unknown>,
    "mutate" | "reset" | "isPending" | "error"
  >,
) {
  const [target, setTarget] = useState<DeleteTarget | null>(null);

  const request = (next: DeleteTarget) => {
    mutation.reset();
    setTarget(next);
  };

  const close = () => setTarget(null);

  const confirm = (onSuccess?: (result: TData) => void) => {
    if (!target) return;
    mutation.mutate(target.id, {
      onSuccess: (result) => {
        setTarget(null);
        onSuccess?.(result);
      },
    });
  };

  return {
    target,
    request,
    confirm,
    dialogProps: {
      open: target !== null,
      pending: mutation.isPending,
      error: mutation.error?.message ?? null,
      onClose: close,
    },
  };
}
