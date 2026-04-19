import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Bind to all interfaces so lvh.me works (resolves to 127.0.0.1)
    host: true,
    // Allow lvh.me and subdomains for local multi-tenant dev
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 3000}`,
        // Don't override Host — the API needs the subdomain for tenant resolution
        changeOrigin: false,
      },
    },
  },
});
