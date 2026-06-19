# =============================================================================
# KavaNow — Multi-stage Dockerfile
# Build targets: "api" (Node runtime) and "caddy" (static SPA + reverse proxy)
# Build context: repository root
# =============================================================================

# ---------------------------------------------------------------------------
# Stage: base — shared Node + pnpm foundation
# ---------------------------------------------------------------------------
FROM node:24.17-alpine AS base
# pnpm version comes from "packageManager" in package.json — corepack's shim
# reads (and hash-verifies) it on first pnpm invocation, so there is no
# version to keep in sync here. Every stage copies package.json before
# running pnpm.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Stage: deps — install all workspace dependencies
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage: api-build — compile shared + API TypeScript
# ---------------------------------------------------------------------------
FROM deps AS api-build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/
ARG API_PORT=3000
ENV API_PORT=$API_PORT
RUN pnpm --filter @kava-now/shared --if-present build && \
    pnpm --filter @kava-now/api build

# ---------------------------------------------------------------------------
# Stage: web-build — build the Vite SPA
# ---------------------------------------------------------------------------
FROM deps AS web-build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/
ARG GOOGLE_CLIENT_ID=
ARG SENTRY_DSN_WEB=
ARG SENTRY_ENVIRONMENT=production
ARG SENTRY_RELEASE=
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
    SENTRY_DSN_WEB=$SENTRY_DSN_WEB \
    SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT \
    SENTRY_RELEASE=$SENTRY_RELEASE
# The BuildKit secret (build-images.yml `secrets:`) reaches the build env only
# inside this RUN — never an image layer. Empty/absent → plugin disabled.
RUN --mount=type=secret,id=sentry_auth_token \
  SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token 2>/dev/null || true) \
  pnpm --filter @kava-now/web build

# ---------------------------------------------------------------------------
# Stage: api-prod-deps — production-only node_modules for API
# ---------------------------------------------------------------------------
FROM base AS api-prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------
# Target: api-jobs — one-shot operational commands (migrations, seeds)
# ---------------------------------------------------------------------------
FROM deps AS api-jobs
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/
# Same privilege drop as the api target (#67): this container holds the
# privileged DATABASE_URL — it must not also run as root. /app stays
# root-owned read-only (a chown -R of dev node_modules would double the
# layer); tsx only needs a writable HOME.
#
# Jobs run tsx DIRECTLY — never `pnpm run` at container runtime: pnpm 11's
# verify-deps-before-run compares mtimes the registry round-trip resets,
# then tries to re-`pnpm install` into the read-only /app (EACCES). The
# .npmrc covers any ad-hoc pnpm invocation on the VM; the env form of the
# setting is NOT honored by pnpm 11.5.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && echo "verify-deps-before-run=false" >> /app/.npmrc
ENV HOME=/tmp
USER appuser
WORKDIR /app/packages/api
CMD ["./node_modules/.bin/tsx", "src/db/migrate.ts"]

# ---------------------------------------------------------------------------
# Target: api — slim Node runtime for the Hono server
# ---------------------------------------------------------------------------
FROM node:24.17-alpine AS api
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=api-build /app/packages/api/dist ./dist
COPY --from=api-build /app/packages/shared/src ./node_modules/@kava-now/shared/src
COPY --from=api-build /app/packages/shared/package.json ./node_modules/@kava-now/shared/
COPY --from=api-prod-deps /app/node_modules ./node_modules
COPY --from=api-prod-deps /app/packages/api/node_modules ./packages-api-nm
# Merge workspace hoisted + package-level deps
RUN cp -rn ./packages-api-nm/* ./node_modules/ 2>/dev/null || true && rm -rf ./packages-api-nm

# Copy migration files needed at runtime. RLS policies live inside the
# migration graph (drizzle/0000_init.sql) — there is no separate rls.sql.
COPY --from=api-build /app/packages/api/drizzle ./drizzle
COPY --from=api-build /app/packages/api/drizzle.config.ts ./drizzle.config.ts

USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------------------
# Target: caddy — static SPA files served by Caddy with API reverse proxy
# ---------------------------------------------------------------------------
FROM caddy:2-alpine AS caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/packages/web/dist /srv/web
