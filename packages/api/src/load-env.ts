import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load the monorepo-root .env regardless of which package script is invoked.
// Uses Node's native process.loadEnvFile (Node 20.6+, stable in Node 22).
const envPath = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
