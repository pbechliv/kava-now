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
});

export const updateCustomerSchema = z.object({
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
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
