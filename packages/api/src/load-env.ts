import { resolve } from "node:path";

// Load the monorepo-root .env regardless of which package script is invoked.
// Uses Node's native process.loadEnvFile (Node 20.6+, stable in Node 22).
process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
