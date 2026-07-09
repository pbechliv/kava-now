/// <reference types="vitest" />
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
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
// Sourcemap upload (#23): only in the image build, where build-images.yml
// mounts the token as a BuildKit secret. Local/CI builds skip it entirely.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || "";
// Web SPA needs the Google OAuth client ID to initialize Google Identity Services.
// When empty, the "Continue with Google" UI is hidden.
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            org: "kavanow",
            project: "kavanow-web",
            authToken: sentryAuthToken,
            release: sentryRelease ? { name: sentryRelease } : undefined,
            telemetry: false,
            sourcemaps: {
              // Maps are uploaded, then stripped from dist — the image must
              // not serve them publicly.
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
            // A Sentry outage must not block a production deploy.
            errorHandler: (err) => {
              console.warn("[sentry-vite-plugin] upload failed (non-fatal):", err.message);
            },
          }),
        ]
      : []),
  ],
  build: {
    // "hidden": emit maps for the Sentry upload without sourceMappingURL
    // comments in the served bundles.
    sourcemap: sentryAuthToken ? "hidden" : false,
  },
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
    // WEB_PORT lets git worktrees run isolated dev servers in parallel (see
    // tools/git/wt). Defaults to 3200 for the primary worktree.
    port: Number(process.env.WEB_PORT) || 3200,
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
