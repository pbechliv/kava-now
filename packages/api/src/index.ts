import "./load-env";
import { app } from "./app";

// In dev, @hono/vite-dev-server handles serving.
// In production, this file is the entry point built by @hono/vite-build/node.
export default app;
