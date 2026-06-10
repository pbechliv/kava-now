import { z } from "zod";

// Invite a user account onto an existing customer (customer role).
export const inviteCustomerUserSchema = z.object({
  email: z.email("Μη έγκυρο email"),
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
});

// Invite a staff member. Customers are managed via /admin/customers (which
// provisions the linked customer-user), so "staff" is the only invitable role.
export const inviteStaffUserSchema = inviteCustomerUserSchema.extend({
  role: z.enum(["staff"], { error: "Επιλέξτε ρόλο" }),
});

export type InviteCustomerUserInput = z.infer<typeof inviteCustomerUserSchema>;
export type InviteStaffUserInput = z.infer<typeof inviteStaffUserSchema>;
