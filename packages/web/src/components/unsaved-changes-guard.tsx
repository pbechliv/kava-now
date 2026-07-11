import { useBlocker } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * Guards against silently losing unsaved edits (#174). While `when` is true it
 * intercepts in-app navigation with a confirm dialog, and arms the browser's
 * native "leave site?" prompt for a reload/tab-close. Render inside any editor
 * that holds dirty, unsaved state; pass its dirty flag as `when`.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: () => when,
    enableBeforeUnload: when,
    withResolver: true,
  });

  return (
    <ConfirmDialog
      open={status === "blocked"}
      title="Μη αποθηκευμένες αλλαγές"
      description="Έχετε αλλαγές που δεν έχουν αποθηκευτεί. Αν φύγετε τώρα, θα χαθούν."
      confirmLabel="Έξοδος χωρίς αποθήκευση"
      onConfirm={() => proceed?.()}
      onClose={() => reset?.()}
    />
  );
}
