import { createAuthClient } from "better-auth/react";

// baseURL is the current origin. Better-auth's client appends "/api/auth/<path>"
// so requests go through Vite's /api proxy with the request's Host header,
// preserving the multi-tenant subdomain.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
});
