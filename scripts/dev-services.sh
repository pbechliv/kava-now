#!/usr/bin/env bash
# Ensure the local dev infrastructure (Postgres + Mailpit) is running before
# `pnpm dev` / `pnpm db:*`. Idempotent and fast when the stack is already up.
#
# No-ops (exit 0) when it shouldn't touch Docker:
#   - CI:                    CI env var set (CI runs its own Postgres service)
#   - production/deploy:     NODE_ENV=production (prod migrates/seeds via the image CMD)
#   - Docker unavailable:    warns and continues so the command can still try
set -euo pipefail

if [ -n "${CI:-}" ] || [ "${NODE_ENV:-}" = "production" ]; then
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "⚠️  docker not found — skipping dev-services startup. Start Postgres + Mailpit yourself." >&2
  exit 0
fi

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.dev.yml"

# --wait blocks until Postgres reports healthy, so migrations don't race startup.
docker compose -f "$COMPOSE_FILE" up -d --wait
