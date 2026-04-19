import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";
import build from "@hono/vite-build/node";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../../.env") });

const apiPort = Number(process.env.API_PORT) || 3000;

export default defineConfig(({ mode }) => {
  if (mode === "production") {
    return {
      plugins: [
        build({
          entry: "./src/index.ts",
          port: apiPort,
        }),
      ],
    };
  }

  return {
    server: {
      port: apiPort,
      strictPort: true,
      host: true,
      allowedHosts: true,
    },
    plugins: [
      devServer({
        entry: "./src/index.ts",
      }),
    ],
  };
});
