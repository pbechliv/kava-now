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
});

export const registerSchema = z.object({
  name: z.string().min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
  slug: z
    .string()
    .min(3, "Το slug πρέπει να έχει τουλάχιστον 3 χαρακτήρες")
    .max(30, "Το slug πρέπει να έχει το πολύ 30 χαρακτήρες")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Το slug πρέπει να περιέχει μόνο πεζά γράμματα, αριθμούς και παύλες",
    )
    .refine(
      (val) => !RESERVED_SLUGS.includes(val),
      "Αυτό το slug είναι δεσμευμένο",
    ),
  email: z.string().email("Μη έγκυρη διεύθυνση email"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
