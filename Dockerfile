# =============================================================================
# KavaNow — Multi-stage Dockerfile
# Build targets: "api" (Node runtime) and "caddy" (static SPA + reverse proxy)
# Build context: repository root
# =============================================================================

# ---------------------------------------------------------------------------
# Stage: base — shared Node + pnpm foundation
# ---------------------------------------------------------------------------
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
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
RUN pnpm --filter @kava-now/shared --if-present build; \
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
RUN pnpm --filter @kava-now/web build

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
CMD ["pnpm", "--filter", "@kava-now/api", "db:migrate"]

# ---------------------------------------------------------------------------
# Target: api — slim Node runtime for the Hono server
# ---------------------------------------------------------------------------
FROM node:24-alpine AS api
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=api-build /app/packages/api/dist ./dist
COPY --from=api-build /app/packages/shared/src ./node_modules/@kava-now/shared/src
COPY --from=api-build /app/packages/shared/package.json ./node_modules/@kava-now/shared/
COPY --from=api-prod-deps /app/node_modules ./node_modules
COPY --from=api-prod-deps /app/packages/api/node_modules ./packages-api-nm
# Merge workspace hoisted + package-level deps
RUN cp -rn ./packages-api-nm/* ./node_modules/ 2>/dev/null || true && rm -rf ./packages-api-nm

# Copy migration files needed at runtime
COPY --from=api-build /app/packages/api/drizzle ./drizzle
COPY --from=api-build /app/packages/api/src/db/rls.sql ./src/db/rls.sql
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
