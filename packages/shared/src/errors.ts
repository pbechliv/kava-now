/**
 * Shared API error codes — backend sends them on 4xx responses, frontend
 * maps them to localized user-facing messages. The backend `error` field
 * stays English (developer/log-facing); translation lives in the frontend.
 */
export const API_ERROR_CODES = {
  DUPLICATE_CUSTOMER_ERP_REF: "DUPLICATE_CUSTOMER_ERP_REF",
  DUPLICATE_PRODUCT_ERP_REF: "DUPLICATE_PRODUCT_ERP_REF",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiErrorBody {
  /** Stable machine-readable code; frontend translates to a user-facing message. */
  code?: ApiErrorCode;
  /** English description for logs / developer tooling. */
  error: string;
}
