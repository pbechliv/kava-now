import type { ApiErrorCode, ApiErrorBody } from "@kava-now/shared";
import { translateApiErrorCode, translateApiErrorStatus } from "./api-error-messages";
import { notifyServerError } from "./deploy-watch";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: ApiErrorCode,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  /**
   * On a 401, redirect the whole window to the login page. Default true.
   * The auth probe (`/api/auth/me`) passes false: a 401 there just means
   * "logged out" and is handled as data by useAuth. Bouncing the window on the
   * probe fights the React-Router guards and, when the probe is remounted, can
   * spin into a redirect/refetch loop.
   */
  redirectOn401?: boolean;
  /** Abort the request after this many ms so a hung connection fails fast. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  { redirectOn401 = true, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  // A hung socket (server restart, flaky network) must not leave a request
  // pending forever — that strands loading spinners. AbortSignal.timeout is
  // supported in every browser this app targets; guard defensively anyway.
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    opts.signal = AbortSignal.timeout(timeoutMs);
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    // Network failure / aborted timeout — the symptom of a deploy swapping the
    // api+caddy containers. Let the deploy guard probe /api/health.
    notifyServerError();
    throw err;
  }

  if (res.status === 401) {
    // If we're not already on a login page, redirect there. Preserve the
    // tenant prefix if we're inside one.
    const currentPath = window.location.pathname;
    // "/" renders the login form itself — bouncing it to /login loses nothing
    // but state.
    if (redirectOn401 && currentPath !== "/" && !/\/login(\b|$)/.test(currentPath)) {
      const tenantMatch = currentPath.match(/^\/k\/([^/]+)/);
      window.location.href = tenantMatch ? `/k/${tenantMatch[1]}/login` : "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    // 5xx = server in trouble (commonly a deploy window): nudge the guard.
    if (res.status >= 500) notifyServerError();
    const data = (await res.json().catch(() => ({ error: res.statusText }))) as Partial<
      ApiErrorBody & { message: string }
    >;
    const code = data.code;
    const englishFallback =
      typeof data.error === "string" ? data.error : (data.message ?? res.statusText);
    const message =
      translateApiErrorCode(code) ?? translateApiErrorStatus(res.status) ?? englishFallback;
    throw new ApiError(res.status, message, code);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
