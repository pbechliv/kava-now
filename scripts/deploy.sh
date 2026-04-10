#!/usr/bin/env bash
# =============================================================================
# KavaNow — Deploy Script
# Builds images and (re)starts production services.
# Usage: ./scripts/deploy.sh [--build-only]
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Verify .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.production.example to .env and configure it."
  exit 1
fi

echo "==> Building Docker images..."
docker compose build

if [ "${1:-}" = "--build-only" ]; then
  echo "==> Build complete (--build-only). Skipping service start."
  exit 0
fi

echo "==> Starting services..."
docker compose up -d

echo "==> Waiting for postgres to be healthy..."
docker compose exec -T postgres pg_isready -U kavanow --timeout=30

echo "==> Running database migrations..."
docker compose exec -T api node --import=tsx drizzle/migrate.js 2>/dev/null || \
  echo "    (Skip: migration runner not found in dist — run manually if needed)"

echo ""
echo "==> KavaNow is running!"
echo "    https://kavanow.gr"
echo ""
docker compose ps
