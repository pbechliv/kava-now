import { API_ERROR_CODES, type ApiErrorCode } from "@kava-now/shared";

/**
 * Greek user-facing messages for backend error codes. The backend sends the
 * code plus an English description (for logs); we translate here so the UI
 * stays localized without leaking Greek strings into the API surface.
 */
const MESSAGES: Record<ApiErrorCode, string> = {
  [API_ERROR_CODES.DUPLICATE_CUSTOMER_ERP_REF]:
    "Ο κωδικός ERP χρησιμοποιείται ήδη από άλλον πελάτη",
  [API_ERROR_CODES.DUPLICATE_PRODUCT_ERP_REF]:
    "Ο κωδικός ERP χρησιμοποιείται ήδη από άλλο προϊόν",
};

export function translateApiErrorCode(code: ApiErrorCode | undefined): string | undefined {
  return code ? MESSAGES[code] : undefined;
}
