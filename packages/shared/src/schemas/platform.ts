import { z } from "zod";

export const kavaSlugSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
});

export type KavaSlugInput = z.infer<typeof kavaSlugSchema>;
