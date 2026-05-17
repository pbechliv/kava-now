# Sentry Error Reporting Integration

## Context

KavaNow currently has no error reporting. Uncaught exceptions on the API ([packages/api/src/app.ts](../packages/api/src/app.ts)) bubble up with no `app.onError()` handler; uncaught errors in the React tree ([packages/web/src/main.tsx](../packages/web/src/main.tsx)) crash the subtree without telemetry. With a multi-tenant production deploy on the horizon (see `plans/hetzner-deployment-plan.md`), we need errors surfaced and grouped by tenant before customer kavas go live.

Decisions captured from the user:

- **Scope: errors only.** No performance tracing, no session replay. Smallest bundle, cheapest plan tier, no PII surface from replay.
- **Source map upload: deferred, but documented in the CI plan.** Stack traces will reference bundled file names initially. The wiring goes into `build-images.yml` (per `plans/github-actions-automation-plan.md`) once CI exists.
- **Multi-tenant tagging is mandatory.** Errors must be filterable by `kava.slug`, `domain.mode` (tenant | superadmin | platform), and `user.role`.
- **No PII by default.** `realEmail` is sensitive; only send `user.id` and `user.role`. `sendDefaultPii: false`.

This plan covers the integration. It does **not** cover the Sentry account/project setup itself — that's a one-time admin action (create two projects, one `node` for API + one `react` for web, grab the two DSNs).

---

## Touchpoints

Mapped from the codebase as it stands today:

| Concern                                      | File                                      | Lines   | Current state                                                               |
| -------------------------------------------- | ----------------------------------------- | ------- | --------------------------------------------------------------------------- |
| API entry (must `Sentry.init` before this)   | `packages/api/src/index.ts`               | 1–6     | Imports `./load-env`, then `./app`                                          |
| Hono app + middleware stack                  | `packages/api/src/app.ts`                 | 15–63   | No `onError`, no `notFound`; `tenant` → `auth` order                        |
| Tenant context (kava resolution)             | `packages/api/src/middleware/tenant.ts`   | —       | Sets `c.var.kava`, `c.var.kavaId`, `c.var.isPlatform`, `c.var.isSuperAdmin` |
| Auth context (user resolution)               | `packages/api/src/middleware/auth.ts`     | —       | Sets `c.var.user`, `c.var.session`                                          |
| API config (env access)                      | `packages/api/src/config.ts`              | 1–22    | Plain `process.env` reads; no Zod                                           |
| API build                                    | `packages/api/vite.config.ts`             | 13–22   | `@hono/vite-build/node`, entry `./src/index.ts`                             |
| Web entry (must `Sentry.init` before render) | `packages/web/src/main.tsx`               | 1–10    | Plain `createRoot().render(<App />)`                                        |
| Web router                                   | `packages/web/src/App.tsx`                | 1–194   | `<BrowserRouter>` + 3 conditional Routes trees                              |
| Web build                                    | `packages/web/vite.config.ts`             | 11–34   | No sourcemap config                                                         |
| Env shape                                    | `.env.example`                            | 1–31    | No Sentry vars                                                              |
| Future CI (sourcemap upload destination)     | `plans/github-actions-automation-plan.md` | 133–147 | `build-images.yml` planned but not yet created                              |

---

## Dependencies

```bash
# API (Hono on @hono/node-server)
pnpm --filter @kava-now/api add @sentry/node

# Web (React 19 SPA)
pnpm --filter @kava-now/web add @sentry/react
```

Both ship as ESM. `@sentry/node` >=8 is OpenTelemetry-based but works fine in errors-only mode (no tracing config = no OTel overhead). `@sentry/react` >=8 provides `ErrorBoundary` and the `withSentryReactRouterV7Routing` HOC (we won't use the routing wrapper since we're skipping tracing, but the SDK is the same).

No new dev deps for this phase. The sourcemap-upload phase later adds `@sentry/vite-plugin`.

---

## Phase 1 — Backend integration

### 1.1 Add Sentry env vars

Append to [.env.example](../.env.example):

```
# Sentry error reporting. Leave SENTRY_DSN empty in dev to disable.
SENTRY_DSN_API=
SENTRY_DSN_WEB=
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=
```

Why two DSNs: Sentry projects are 1:1 with platforms; we want a `node` project for API and a `react` project for web so the issue triage UI behaves correctly. `SENTRY_ENVIRONMENT` becomes `production` in `.env.production.example`. `SENTRY_RELEASE` is left empty until CI sets it (see Phase 3).

The web build also needs the DSN, which means the web vite config must whitelist it via `define` (see 2.2). The web DSN is not a secret — Sentry DSNs are public by design (they only allow event ingestion, not read).

### 1.2 Extend config

[packages/api/src/config.ts](../packages/api/src/config.ts) — add a `sentry` block:

```ts
sentry: {
  dsn: process.env.SENTRY_DSN_API || "",
  environment: process.env.SENTRY_ENVIRONMENT || (process.env.NODE_ENV === "production" ? "production" : "development"),
  release: process.env.SENTRY_RELEASE || undefined,
  enabled: !!process.env.SENTRY_DSN_API,
},
```

The `enabled` flag means dev runs without a DSN are silent no-ops instead of warnings on every request.

### 1.3 Initialize Sentry as the very first import

Create [packages/api/src/sentry.ts](../packages/api/src/sentry.ts):

```ts
import "./load-env";
import * as Sentry from "@sentry/node";
import { config } from "./config";

if (config.sentry.enabled) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release,
    sendDefaultPii: false,
    // Errors only — no tracing, no profiling.
    tracesSampleRate: 0,
    // Reduce noise from operational errors we already handle.
    ignoreErrors: [
      // Expected client disconnects, not bugs.
      "AbortError",
      "ECONNRESET",
    ],
  });
}

export { Sentry };
```

Then make it the **first** line of [packages/api/src/index.ts](../packages/api/src/index.ts):

```ts
import "./sentry"; // MUST be first so Node instrumentation patches happen before other imports
import { app } from "./app";

export default app;
```

`./sentry` already imports `./load-env`, so we drop the existing `import "./load-env"` from `index.ts`.

**Why first**: `@sentry/node` patches Node globals (`process.on("uncaughtException")`, `process.on("unhandledRejection")`) and HTTP modules on init. Importing it after `./app` means any error thrown during module evaluation (e.g., a bad DB connection at boot) is swallowed.

### 1.4 Attach tenant + user context per request

Create [packages/api/src/middleware/sentry-context.ts](../packages/api/src/middleware/sentry-context.ts):

```ts
import type { MiddlewareHandler } from "hono";
import * as Sentry from "@sentry/node";
import type { AppEnv } from "../types";

export const sentryContextMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const kava = c.get("kava");
  const isSuperAdmin = c.get("isSuperAdmin");
  const isPlatform = c.get("isPlatform");
  const user = c.get("user");

  Sentry.getCurrentScope().setTags({
    "kava.slug": kava?.slug ?? null,
    "kava.id": kava?.id ?? null,
    "domain.mode": isSuperAdmin ? "superadmin" : isPlatform ? "platform" : "tenant",
    "user.role": user?.role ?? "anonymous",
  });

  if (user) {
    // id only — no email. realEmail is PII and not needed for triage.
    Sentry.setUser({ id: user.id });
  }

  await next();
};
```

Mount in [packages/api/src/app.ts](../packages/api/src/app.ts) **after** `tenantMiddleware` and `authMiddleware` so the context vars are populated:

```ts
app.use("*", tenantMiddleware);
app.use("*", authMiddleware);
app.use("*", sentryContextMiddleware); // <-- new
```

Note on Hono's per-request scope: `@sentry/node` uses AsyncLocalStorage internally so each Hono request gets its own scope automatically — `setTags`/`setUser` on `getCurrentScope()` won't leak across concurrent requests.

### 1.5 Capture errors via `app.onError`

Add to [packages/api/src/app.ts](../packages/api/src/app.ts) **after** all `app.route(...)` and `app.use(...)` calls but **before** `export { app }`:

```ts
import * as Sentry from "@sentry/node";
import { HTTPException } from "hono/http-exception";

app.onError((err, c) => {
  // Don't report intentional 4xx — those are control flow, not bugs.
  if (err instanceof HTTPException && err.status < 500) {
    return err.getResponse();
  }
  Sentry.captureException(err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: "Internal server error" }, 500);
});
```

This is also the place to convert from "stack trace in logs" to a stable JSON shape that matches the rest of the API.

### 1.6 Verify

- `pnpm typecheck` clean.
- `pnpm dev:api` boots with `SENTRY_DSN_API` empty → no Sentry traffic (verified via `enabled` guard).
- Add a temporary `app.get("/api/sentry-test", () => { throw new Error("sentry smoke test"); })`, hit it with `SENTRY_DSN_API` set, confirm event arrives in Sentry tagged with `kava.slug=demo` when called via `http://localhost:3200/k/demo`. Remove the test route before commit.

---

## Phase 2 — Frontend integration

### 2.1 Initialize Sentry before React mounts

Edit [packages/web/src/main.tsx](../packages/web/src/main.tsx):

```ts
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { App } from "./App";
import "./index.css";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "development",
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
```

`Sentry.ErrorBoundary` catches render-phase errors anywhere in the React tree. `Sentry.init` itself patches `window.onerror` and `window.onunhandledrejection`, so async errors outside the React tree also get reported.

**On the fallback**: a single global fallback is intentionally minimal — anything more elaborate (recovery actions, a "Report bug" button) is a separate UX exercise and can land later. The point of this phase is telemetry, not UX.

### 2.2 Pass build-time env vars

Edit [packages/web/vite.config.ts](../packages/web/vite.config.ts):

```ts
process.loadEnvFile(resolve(__dirname, "../../.env"));

const sentryDsn = process.env.SENTRY_DSN_WEB || "";
const sentryEnv = process.env.SENTRY_ENVIRONMENT || "development";
const sentryRelease = process.env.SENTRY_RELEASE || "";

export default defineConfig({
  // ...
  define: {
    "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(sentryDsn),
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnv),
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease),
  },
  // ...
});
```

**Do not** prefix Sentry env vars with `VITE_` in `.env` — the `define` block whitelists exactly what is exposed at build time, which is what we want for production builds.

### 2.3 Set user + tenant scope after auth resolves

Sentry events triggered before auth has loaded won't have tenant tags — that's a one-line annoyance, not a blocker. To get tags on most events, hook into the existing `useAuth` hook (or wherever the session settles). Plan stub:

In [packages/web/src/hooks/useAuth.ts](../packages/web/src/hooks/useAuth.ts) (or equivalent), after the session + `/api/auth/me` response settles, add:

```ts
import * as Sentry from "@sentry/react";

useEffect(() => {
  if (user) {
    Sentry.setUser({ id: user.id });
    Sentry.setTags({
      "kava.id": user.kavaId ?? null,
      "user.role": user.role,
    });
  } else {
    Sentry.setUser(null);
  }
}, [user]);
```

The `kava.slug` tag is set from the URL path — derive it once at boot in `main.tsx` (right after `Sentry.init`):

```ts
const path = window.location.pathname;
const tenantMatch = path.match(/^\/k\/([^/]+)/);
const isAdmin = path.startsWith("/admin");
Sentry.setTag("domain.mode", isAdmin ? "superadmin" : tenantMatch ? "tenant" : "platform");
Sentry.setTag("kava.slug", tenantMatch?.[1] ?? null);
```

(Sentry needs this inline before any other code has a chance to throw, hence reading directly from `window.location` rather than waiting for React Router to resolve the `:slug` param.)

### 2.4 Verify

- `pnpm typecheck` clean.
- `pnpm dev:web` with `SENTRY_DSN_WEB` empty → no `Sentry.init` call (guard).
- Add a temporary route or button: `<button onClick={() => { throw new Error("sentry web smoke test"); }}>`. With DSN set, click it via `http://localhost:3200/k/demo`, confirm event arrives tagged `kava.slug=demo`, `domain.mode=tenant`. Remove the button.
- Verify the `<Sentry.ErrorBoundary>` fallback renders by throwing during a render (not in an event handler). Confirm the event is captured and the fallback DOM is what users see.

---

## Phase 3 — Source map upload (deferred, documented for future CI)

We are **not** wiring sourcemap upload in this integration. Stack traces will reference bundled files. Below is the slot-in plan for when CI lands.

### 3.1 Web (Vite)

Install `@sentry/vite-plugin` as a dev dep on `@kava-now/web`. In [packages/web/vite.config.ts](../packages/web/vite.config.ts), add:

```ts
import { sentryVitePlugin } from "@sentry/vite-plugin";

// ...
plugins: [
  react(),
  tailwindcss(),
  // Only active when SENTRY_AUTH_TOKEN is present (CI), so local builds skip it.
  ...(process.env.SENTRY_AUTH_TOKEN
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT_WEB, // e.g. "kavanow-web"
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: process.env.SENTRY_RELEASE },
        }),
      ]
    : []),
],
build: { sourcemap: true }, // emit .map files for upload
```

The plugin uploads + deletes maps post-build so they're not served from origin.

### 3.2 API (Vite via `@hono/vite-build`)

Same plugin works for the API's Vite build. In [packages/api/vite.config.ts](../packages/api/vite.config.ts):

```ts
import { sentryVitePlugin } from "@sentry/vite-plugin";

// inside the production branch only:
plugins: [
  build({ entry: "./src/index.ts", port: apiPort }),
  ...(process.env.SENTRY_AUTH_TOKEN
    ? [sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT_API,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: process.env.SENTRY_RELEASE },
      })]
    : []),
],
build: { sourcemap: true },
```

### 3.3 CI changes — slot into the planned `build-images.yml`

Per `plans/github-actions-automation-plan.md:133-147`, `build-images.yml` is the reusable workflow that builds the Docker images and pushes to GHCR. Sourcemap upload happens **inside** the build step, before `docker push`, because the `vite build` output is what produces and (after upload) deletes the `.map` files.

Two repo-level secrets to add when CI lands:

| Secret              | Notes                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN` | Project-scoped token with `project:releases` + `project:write`. Generate in Sentry settings → Auth Tokens. **Not** an org-level token. |
| `SENTRY_ORG`        | Slug, e.g. `kavanow`. Could also be hardcoded in the workflow — it isn't secret.                                                       |

Two repo-level variables (`vars`, not `secrets`):

| Variable             | Example       |
| -------------------- | ------------- |
| `SENTRY_PROJECT_API` | `kavanow-api` |
| `SENTRY_PROJECT_WEB` | `kavanow-web` |

Inside `build-images.yml`, before the `docker build` step (assuming images are built from pre-compiled `dist/`):

```yaml
- name: Build packages (API + Web)
  run: pnpm build
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT_API: ${{ vars.SENTRY_PROJECT_API }}
    SENTRY_PROJECT_WEB: ${{ vars.SENTRY_PROJECT_WEB }}
    SENTRY_RELEASE: ${{ github.sha }}
    SENTRY_ENVIRONMENT: production
```

If the current `Dockerfile` does `pnpm build` _inside_ the image (it does — see the multi-stage `builder` target), one of two changes is needed:

1. **Preferred**: keep build-in-Docker; add `--build-arg`s for the four Sentry inputs and `ARG`/`ENV` them inside the Dockerfile's `builder` stage so the plugin sees them. The `SENTRY_AUTH_TOKEN` must be passed via `--secret` (BuildKit) so it doesn't end up in image layers.
2. **Alternative**: split build out of Docker (the `plans/github-actions-automation-plan.md` already moves toward this for resource reasons — Hetzner CX22 can't build). Then sourcemap upload is just a regular workflow step.

Both options should be a single line added to the CI plan when `build-images.yml` is authored. **No change to this Sentry plan is needed beyond this section.**

### 3.4 Release tagging

`SENTRY_RELEASE=${{ github.sha }}` ties events to commits. The API and web both read this env at build time and bake it into the bundle. On error in Sentry's UI, the issue will be tied to a release object that the plugin already uploaded sourcemaps to → resolved stack frames.

---

## Configuration summary (what changes)

### Files added

- `packages/api/src/sentry.ts`
- `packages/api/src/middleware/sentry-context.ts`

### Files modified

- `packages/api/src/index.ts` — import `./sentry` first; drop redundant `./load-env`
- `packages/api/src/app.ts` — mount `sentryContextMiddleware`; add `app.onError`
- `packages/api/src/config.ts` — add `sentry` block
- `packages/web/src/main.tsx` — `Sentry.init` + `<Sentry.ErrorBoundary>` + initial tags
- `packages/web/src/hooks/useAuth.ts` — `Sentry.setUser` / `setTags` on auth change
- `packages/web/vite.config.ts` — `define` four `VITE_SENTRY_*` keys
- `.env.example` — four Sentry vars
- `.env.production.example` — same four vars with prod defaults

### Files **not** touched

- No CI workflow files (none exist yet; see Phase 3 for the slot-in).
- No `Dockerfile` change (deferred with Phase 3).
- No DB migration.
- No new `vp lint` rule.

### Env vars introduced

| Var                  | API     | Web              | Notes                                                  |
| -------------------- | ------- | ---------------- | ------------------------------------------------------ |
| `SENTRY_DSN_API`     | ✓       |                  | Empty → SDK disabled                                   |
| `SENTRY_DSN_WEB`     |         | ✓ (via `define`) | Empty → SDK disabled. **Not secret**; DSNs are public. |
| `SENTRY_ENVIRONMENT` | ✓       | ✓                | `development` / `production`                           |
| `SENTRY_RELEASE`     | ✓       | ✓                | Empty in dev; `$GITHUB_SHA` in CI                      |
| `SENTRY_AUTH_TOKEN`  | (build) | (build)          | CI-only, Phase 3                                       |
| `SENTRY_ORG`         | (build) | (build)          | CI-only, Phase 3                                       |
| `SENTRY_PROJECT_API` | (build) |                  | CI-only, Phase 3                                       |
| `SENTRY_PROJECT_WEB` |         | (build)          | CI-only, Phase 3                                       |

---

## Rollback

Sentry integration is fully gated on DSN env vars. To disable in production without a deploy: unset `SENTRY_DSN_API` and `SENTRY_DSN_WEB` (the web one requires a rebuild since it's baked in via `define` — there's no runtime kill switch on the SPA).

To disable on the API at runtime: `SENTRY_DSN_API=""` and restart the container. The `config.sentry.enabled` flag short-circuits `Sentry.init` and `Sentry.captureException` becomes a no-op when the SDK isn't initialized.

To rip the integration out entirely:

1. Revert the commit set tagged for this plan.
2. Remove `@sentry/node` and `@sentry/react` from the two `package.json` files.
3. `pnpm install`.

---

## Out of scope

Explicitly deferred:

- **Performance tracing** (`tracesSampleRate > 0`). Adds OTel instrumentation, transaction overhead, more events. Revisit when there's a concrete slow-endpoint hunt.
- **Session Replay** (`@sentry/replay`). Privacy and bundle implications need a separate review with masking config for customer order data.
- **Profiling** (`@sentry/profiling-node`). Heavy; only useful with tracing on.
- **Custom breadcrumbs / fingerprinting rules.** Defaults are fine until we have a noise problem.
- **Alerting rules + integrations** (Slack, PagerDuty). Configured in Sentry's UI, not in this codebase. Owner: whoever sets up the Sentry org.
- **Sourcemap upload wiring in CI.** Documented in Phase 3, executed when `build-images.yml` lands.

---

## Open questions

1. **Sentry org/project naming.** Suggest `kavanow-api` and `kavanow-web` under a single `kavanow` org. Needs admin sign-off.
2. **Dev DSN behavior.** Plan assumes empty DSN in dev = no events. Alternative: separate dev DSN to dogfood the integration. Recommendation: empty in dev, set in CI/preview/production. Local errors are already visible in the terminal.
3. **`realEmail` opt-in for support cases.** The plan strips `realEmail` from all events. If support needs it for a specific bug, the workaround is to add a temporary `Sentry.setContext("debug", { realEmail })` on a feature flag — not a default.
