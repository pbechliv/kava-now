import { createAuthClient } from "better-auth/react";

// baseURL is the current origin — there's only one. Better-auth's client
// appends "/api/auth/<path>" so requests flow through Vite's /api proxy.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
});
