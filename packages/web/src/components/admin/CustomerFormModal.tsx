import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@kava-now/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/spinner";
import { AssignedUsersField } from "@/components/admin/AssignedUsersField";
import { useCustomer, useCreateCustomer, useUpdateCustomer } from "@/lib/hooks/use-customers";

interface Props {
  open: boolean;
  customerId?: string;
  onClose: () => void;
}

type FormData = CreateCustomerInput;

export function CustomerFormModal({ open, customerId, onClose }: Props) {
  const isEdit = !!customerId;
  const { data: customer, isLoading: customerLoading } = useCustomer(
    isEdit ? customerId : undefined,
  );
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();

  const form = useForm<FormData>({
    resolver: zodResolver(createCustomerSchema),
  });

  useEffect(() => {
    if (open && !isEdit) {
      form.reset({
        name: "",
        email: null,
        address: null,
        phone: null,
        contactPerson: null,
        notes: null,
        vatId: null,
        taxOffice: null,
        profession: null,
        billingAddress: null,
        erpRef: null,
        assignedUserIds: [],
      });
    }
  }, [open, isEdit, form]);

  useEffect(() => {
    if (customer && isEdit) {
      form.reset({
        name: customer.name,
        email: customer.email,
        address: customer.address,
        phone: customer.phone,
        contactPerson: customer.contactPerson,
        notes: customer.notes,
        vatId: customer.vatId,
        taxOffice: customer.taxOffice,
        profession: customer.profession,
        billingAddress: customer.billingAddress,
        erpRef: customer.erpRef,
        assignedUserIds: customer.assignedUserIds ?? [],
      });
    }
  }, [customer, isEdit, form]);

  const onSubmit = async (data: FormData) => {
    const cleaned = {
      ...data,
      email: data.email || null,
      address: data.address || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      notes: data.notes || null,
      vatId: data.vatId || null,
      taxOffice: data.taxOffice || null,
      profession: data.profession || null,
      billingAddress: data.billingAddress || null,
      erpRef: data.erpRef || null,
      assignedUserIds: data.assignedUserIds ?? [],
    };

    if (customerId) {
      updateMutation.mutate(
        { id: customerId, data: cleaned as UpdateCustomerInput },
        {
          onSuccess: () => {
            toast.success("Ο πελάτης ενημερώθηκε");
            onClose();
          },
        },
      );
    } else {
      createMutation.mutate(cleaned, {
        onSuccess: (created) => {
          if (created.userInviteError) {
            toast.warning(
              "Ο πελάτης δημιουργήθηκε, αλλά η πρόσκληση χρήστη απέτυχε — στείλτε την ξανά από τη σελίδα χρηστών",
            );
          } else {
            toast.success("Ο πελάτης δημιουργήθηκε");
          }
          onClose();
        },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Επεξεργασία Πελάτη" : "Νέος Πελάτης"}</DialogTitle>
        </DialogHeader>

        {isEdit && customerLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Όνομα</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
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
                      <Input
                        type="email"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    {!isEdit && <FormDescription>Θα σταλεί πρόσκληση μέσω email</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Τηλέφωνο</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Υπεύθυνος</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Διεύθυνση</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="border-t pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Στοιχεία τιμολόγησης
                </p>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="erpRef"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Κωδικός ERP</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="vatId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ΑΦΜ</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="taxOffice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ΔΟΥ</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="profession"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Επάγγελμα / Δραστηριότητα</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Διεύθυνση χρέωσης</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Σημειώσεις</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assignedUserIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ανατεθειμένοι χρήστες</FormLabel>
                    <FormControl>
                      <AssignedUsersField value={field.value ?? []} onChange={field.onChange} />
                    </FormControl>
                    <FormDescription>
                      Λαμβάνουν ειδοποιήσεις για τις παραγγελίες αυτού του πελάτη
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(createMutation.error || updateMutation.error) && (
                <p className="text-sm text-destructive">
                  {(createMutation.error || updateMutation.error)?.message}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Ακύρωση
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEdit ? "Αποθήκευση" : "Δημιουργία"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
