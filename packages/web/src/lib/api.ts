export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(path, opts);

  if (res.status === 401) {
    // If we're not already on the login page, redirect there
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    const typed = data as { error?: string; message?: string };
    throw new ApiError(res.status, typed.error ?? typed.message ?? res.statusText);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
