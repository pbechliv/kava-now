import { defineConfig } from "vite-plus";
import devServer from "@hono/vite-dev-server";
import build from "@hono/vite-build/node";
import { resolve } from "node:path";

process.loadEnvFile(resolve(__dirname, "../../.env"));

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
