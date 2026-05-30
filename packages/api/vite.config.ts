/// <reference types="vitest" />
import { defineConfig } from "vite-plus";
import devServer from "@hono/vite-dev-server";
import build from "@hono/vite-build/node";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(__dirname, "../../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const apiPort = Number(process.env.API_PORT) || 3300;

export default defineConfig(({ mode }) => {
  const esbuild = { jsx: "automatic" as const, jsxImportSource: "react" };

  // Under Vitest, skip the Hono dev-server/build plugins (they would try to
  // boot a server) and expose only the test config.
  if (process.env.VITEST || mode === "test") {
    return {
      esbuild,
      test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
      },
    };
  }

  if (mode === "production") {
    return {
      esbuild,
      plugins: [
        build({
          entry: "./src/index.ts",
          port: apiPort,
        }),
      ],
    };
  }

  return {
    esbuild,
    server: {
      port: apiPort,
      strictPort: true,
    },
    plugins: [
      devServer({
        entry: "./src/index.ts",
      }),
    ],
  };
});
