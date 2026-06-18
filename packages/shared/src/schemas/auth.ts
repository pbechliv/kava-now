import { z } from "zod";

// Slugs that would clash with top-level paths or be visually confusing
// adjacent to them (`/admin/*`, `/login`, `/auth/*`, `/api/*`, `/k/...`).
const RESERVED_SLUGS = ["admin", "api", "auth", "login", "k"];

export const loginSchema = z.object({
  email: z.string().email("Μη έγκυρη διεύθυνση email"),
  password: z.string().min(1, "Εισάγετε τον κωδικό σας"),
});

const passwordField = z.string().min(8, "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");

export const registerSchema = z
  .object({
    name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
    slug: z
      .string()
      .min(3, "Το slug πρέπει να έχει τουλάχιστον 3 χαρακτήρες")
      .max(30, "Το slug πρέπει να έχει το πολύ 30 χαρακτήρες")
      .regex(
        /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
        "Το slug πρέπει να περιέχει μόνο πεζά γράμματα, αριθμούς και παύλες",
      )
      .refine((val) => !RESERVED_SLUGS.includes(val), "Αυτό το slug είναι δεσμευμένο"),
    email: z.string().email("Μη έγκυρη διεύθυνση email"),
    password: passwordField.optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.password && !data.confirmPassword) return false;
      if (!data.password && data.confirmPassword) return false;
      if (data.password && data.confirmPassword) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      message: "Οι κωδικοί δεν ταιριάζουν",
      path: ["confirmPassword"],
    },
  );

export const forgotPasswordSchema = z.object({
  email: z.string().email("Μη έγκυρη διεύθυνση email"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Οι κωδικοί δεν ταιριάζουν",
    path: ["confirmPassword"],
  });

// Body of PATCH /api/auth/me — edit the current user's name and/or email.
// currentPassword is proof-of-ownership, required by the handler when the email
// actually changes.
export const updateMeSchema = z.object({
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες").optional(),
  email: z.email("Μη έγκυρο email").optional(),
  currentPassword: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
