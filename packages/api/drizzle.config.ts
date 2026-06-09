import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Load the repo-root .env — credential-requiring drizzle-kit commands used to
// depend on whatever the caller's shell happened to export. Inline (not via
// load-env.ts): drizzle-kit bundles this config to CJS, where
// import.meta.dirname is unavailable. cwd is packages/api via the scripts.
const envPath = resolve(process.cwd(), "../../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
