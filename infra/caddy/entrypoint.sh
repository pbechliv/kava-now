#!/bin/sh
# Sync the image's build (/srv/web-dist) into the volume-backed web root so
# hashed assets from previous deploys stay serveable: a page load that
# straddles a deploy holds the old index.html and requests old chunk URLs —
# if the swap deleted them, the entry script 404s and the user gets a white
# screen until a manual reload.
set -eu

DIST=/srv/web-dist
ROOT=/srv/web

mkdir -p "$ROOT/assets"
# Plain cp (no -p): the current build's files get fresh mtimes on every
# container start, so the prune below can never touch them.
cp -R "$DIST"/. "$ROOT"/
# Hashed assets not shipped by any deploy in 30 days have aged out of every
# cached index.html that could reference them. Non-fatal: a failed prune
# must not block serving.
find "$ROOT/assets" -type f -mtime +30 -delete || true

exec "$@"
