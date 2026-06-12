import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { inviteCustomerUserSchema, type InviteCustomerUserInput } from "@kava-now/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Extra hint rendered between the fields and the error/footer. */
  footnote?: React.ReactNode;
  pending: boolean;
  error: unknown;
  /** Close the dialog from the caller's onSuccess — the form resets on close. */
  onSubmit: (values: InviteCustomerUserInput) => void;
}

/**
 * Name + email invite form shared by the staff Users page and the customer
 * Users page. Callers own the mutation; the staff page adds `role: "staff"`
 * before submitting (inviteStaffUserSchema is this schema + role).
 */
export function InviteUserDialog({
  open,
  onOpenChange,
  title,
  description,
  footnote,
  pending,
  error,
  onSubmit,
}: InviteUserDialogProps) {
  const form = useForm<InviteCustomerUserInput>({
    resolver: zodResolver(inviteCustomerUserSchema),
    defaultValues: { name: "", email: "" },
  });

  // Covers both user-initiated and programmatic (onSuccess) closes.
  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Όνομα</FormLabel>
                  <FormControl>
                    <Input placeholder="Γιάννης Παπαδόπουλος" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {footnote}
            {error != null && (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Σφάλμα"}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Άκυρο
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Αποστολή
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
