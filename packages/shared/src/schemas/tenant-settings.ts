import { z } from "zod";

const optionalEmail = z.string().email("Μη έγκυρο email").max(254);

export const updateTenantSettingsSchema = z
  .object({
    name: z.string().trim().min(1, "Το όνομα είναι υποχρεωτικό").max(200).optional(),
    address: z.string().trim().max(500).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    email: optionalEmail.optional(),
    logoUrl: z.string().trim().url("Μη έγκυρο URL").max(2048).optional().nullable(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Δεν δόθηκαν πεδία για ενημέρωση",
  });

export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;

// Self-service per-membership preference: receive every order's notification
// in the current tenant, regardless of customer assignment.
export const updateNotificationPreferenceSchema = z
  .object({
    notifyAllOrders: z.boolean(),
  })
  .strict();

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
