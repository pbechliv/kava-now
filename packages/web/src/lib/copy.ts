import { toast } from "sonner";

export async function copyToClipboard(text: string, successMessage = "Αντιγράφηκε") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Δεν ήταν δυνατή η αντιγραφή");
  }
}
