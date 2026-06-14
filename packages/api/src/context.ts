import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, AuthUser, RequestMembership, Tenant } from "./types";

// Typed accessors for request-context variables that upstream middleware
// guarantees (authMiddleware, tenantMiddleware, requireRole,
// requireCustomerProfile). They replace non-null assertions (`!`): if the
// variable is somehow absent, we throw an HTTPException the app's onError
// renders, instead of asserting it away.

function require<T>(value: T | null | undefined, status: 400 | 401 | 403, error: string): T {
  if (value == null) {
    throw new HTTPException(status, { message: error });
  }
  return value;
}

export function getUser(c: Context<AppEnv>): AuthUser {
  return require(c.get("user"), 401, "Unauthorized");
}

export function getTenant(c: Context<AppEnv>): Tenant {
  return require(c.get("tenant"), 400, "Tenant context required");
}

export function getTenantId(c: Context<AppEnv>): string {
  return require(c.get("tenantId"), 400, "Tenant context required");
}

export function getCustomerId(c: Context<AppEnv>): string {
  return require(c.get("customerId"), 400, "Customer profile required");
}

export function getMembership(c: Context<AppEnv>): RequestMembership {
  return require(c.get("membership"), 403, "Membership required");
}
