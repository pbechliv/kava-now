import type { MiddlewareHandler } from "hono";
import { API_ERROR_CODES } from "@kava-now/shared";
import type { AppEnv } from "../types";

/**
 * Guards customer routes whose handlers need a linked `customers` row.
 * `requireRole("customer")` only proves a membership exists — superadmins get
 * a synthetic membership and data anomalies can leave `customerId` null — so
 * resolve it once here and expose it as `c.get("customerId")`.
 */
export const requireCustomerProfile: MiddlewareHandler<AppEnv> = async (c, next) => {
  const customerId = c.get("membership")?.customerId ?? null;

  if (!customerId) {
    return c.json(
      {
        code: API_ERROR_CODES.CUSTOMER_PROFILE_MISSING,
        error: "Customer profile not linked to this user",
      },
      400,
    );
  }

  c.set("customerId", customerId);
  await next();
};
