import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";
import build from "@hono/vite-build/node";

export default defineConfig(({ mode }) => {
  if (mode === "production") {
    return {
      plugins: [
        build({
          entry: "./src/index.ts",
          port: 3000,
        }),
      ],
    };
  }

  return {
    server: {
      port: 3000,
    },
    plugins: [
      devServer({
        entry: "./src/index.ts",
      }),
    ],
  };
});
