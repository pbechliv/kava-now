/// <reference types="vitest" />
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

process.loadEnvFile(resolve(__dirname, "../../.env"));

const baseDomain = process.env.BASE_DOMAIN || "lvh.me:5173";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_BASE_DOMAIN": JSON.stringify(baseDomain),
  },
  server: {
    port: 5173,
    // Bind to all interfaces so wildcard subdomains (lvh.me, *.localhost) resolve
    host: true,
    // Allow any subdomain for local multi-tenant dev
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 3000}`,
        // Don't override Host — the API needs the subdomain for tenant resolution
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
