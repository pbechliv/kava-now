import type { Context } from "hono";
import type { ZodError } from "zod";
import { API_ERROR_CODES } from "@kava-now/shared";

/**
 * One wire shape for every zod validation failure. `error` stays English
 * (dev/log-facing, matching the ApiErrorBody contract); `fields`/`formErrors`
 * carry the schema messages (localized in the shared schemas) that the web
 * client renders directly. Replaces the old `{ error: fieldErrors }` shape,
 * whose object-valued `error` the client couldn't display.
 */
export function validationError(c: Context, error: ZodError) {
  const { fieldErrors, formErrors } = error.flatten();
  return c.json(
    {
      error: "Validation failed",
      code: API_ERROR_CODES.VALIDATION_ERROR,
      fields: fieldErrors,
      formErrors,
    },
    400,
  );
}
