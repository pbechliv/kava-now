import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό"),
  email: z.string().email("Μη έγκυρο email").optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  vatId: z.string().optional().nullable(),
  taxOffice: z.string().optional().nullable(),
  profession: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  erpRef: z.string().optional().nullable(),
  // Staff/owner users responsible for this customer's orders. Optional — the
  // form nudges but never blocks. Validated server-side as tenant members.
  assignedUserIds: z.array(z.string().uuid()).optional(),
});

export const updateCustomerSchema = z
  .object({
    name: z.string().min(1, "Το όνομα είναι υποχρεωτικό").optional(),
    email: z.string().email("Μη έγκυρο email").optional().nullable(),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    contactPerson: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    vatId: z.string().optional().nullable(),
    taxOffice: z.string().optional().nullable(),
    profession: z.string().optional().nullable(),
    billingAddress: z.string().optional().nullable(),
    erpRef: z.string().optional().nullable(),
    // Present → replace the customer's assignments wholesale (empty clears).
    assignedUserIds: z.array(z.string().uuid()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Δεν δόθηκαν πεδία για ενημέρωση");

// Body of PATCH /customer/profile — customers may update only their own phone
// and address (name/email stay admin-controlled).
export const updateProfileSchema = z.object({
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
