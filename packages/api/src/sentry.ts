import "./load-env";
import * as Sentry from "@sentry/node";
import { config } from "./config";

if (config.sentry.enabled) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    ignoreErrors: ["AbortError", "ECONNRESET"],
  });
}

export { Sentry };
