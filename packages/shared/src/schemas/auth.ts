import { z } from "zod";

const RESERVED_SLUGS = [
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "ftp",
  "smtp",
  "pop",
  "imap",
  "blog",
  "help",
  "support",
  "status",
  "docs",
];

export const loginSchema = z.object({
  email: z.string().email("Μη έγκυρη διεύθυνση email"),
  password: z.string().optional(),
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

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordField,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Οι κωδικοί δεν ταιριάζουν",
    path: ["confirmNewPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
