/// <reference types="vitest" />
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(__dirname, "../../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const sentryDsn = process.env.SENTRY_DSN_WEB || "";
const sentryEnv =
  process.env.SENTRY_ENVIRONMENT ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const sentryRelease = process.env.SENTRY_RELEASE || "";
// Web SPA needs the Google OAuth client ID to initialize Google Identity Services.
// When empty, the "Continue with Google" UI is hidden.
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(sentryDsn),
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnv),
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease),
    "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(googleClientId),
  },
  server: {
    port: 3200,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 3300}`,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
