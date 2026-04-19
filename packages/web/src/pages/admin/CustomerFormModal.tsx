import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@kava-now/shared";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import {
  useCustomer,
  useCreateCustomer,
  useUpdateCustomer,
} from "../../lib/hooks/use-customers";

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(createCustomerSchema),
  });

  useEffect(() => {
    if (open && !isEdit) {
      reset({
        name: "",
        email: null,
        address: null,
        phone: null,
        contactPerson: null,
        notes: null,
      });
    }
  }, [open, isEdit, reset]);

  useEffect(() => {
    if (customer && isEdit) {
      reset({
        name: customer.name,
        email: customer.email,
        address: customer.address,
        phone: customer.phone,
        contactPerson: customer.contactPerson,
        notes: customer.notes,
      });
    }
  }, [customer, isEdit, reset]);

  const onSubmit = async (data: FormData) => {
    // Normalise empty strings to null for optional fields
    const cleaned = {
      ...data,
      email: data.email || null,
      address: data.address || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      notes: data.notes || null,
    };

    if (isEdit) {
      await updateMutation.mutateAsync({
        id: customerId!,
        data: cleaned as UpdateCustomerInput,
      });
    } else {
      await createMutation.mutateAsync(cleaned);
    }
    onClose();
  };

  if (!open) return null;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-gray-900">
          {isEdit ? "Επεξεργασία Πελάτη" : "Νέος Πελάτης"}
        </h2>

        {isEdit && customerLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-4 space-y-4"
          >
            <Input
              label="Όνομα *"
              id="customer-name"
              {...register("name")}
              error={errors.name?.message}
            />

            <div>
              <Input
                label="Email"
                id="customer-email"
                type="email"
                {...register("email")}
                error={errors.email?.message}
              />
              {!isEdit && (
                <p className="mt-1 text-xs text-gray-500">
                  Θα σταλεί πρόσκληση μέσω email
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Τηλέφωνο"
                id="customer-phone"
                {...register("phone")}
                error={errors.phone?.message}
              />
              <Input
                label="Υπεύθυνος"
                id="customer-contactPerson"
                {...register("contactPerson")}
                error={errors.contactPerson?.message}
              />
            </div>

            <Input
              label="Διεύθυνση"
              id="customer-address"
              {...register("address")}
              error={errors.address?.message}
            />

            <div>
              <label
                htmlFor="customer-notes"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Σημειώσεις
              </label>
              <textarea
                id="customer-notes"
                rows={3}
                {...register("notes")}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {(createMutation.error || updateMutation.error) && (
              <p className="text-sm text-red-600">
                {(createMutation.error || updateMutation.error)?.message}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isPending}>
                {isEdit ? "Αποθήκευση" : "Δημιουργία"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
              >
                Ακύρωση
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
