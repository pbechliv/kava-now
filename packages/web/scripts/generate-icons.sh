#!/usr/bin/env bash
# Regenerate the KavaNow favicon/app-icon set from a single SVG source of truth.
#
# Brand mark: amber squircle (amber-500 #f59e0b → amber-600 #d97706) with a bold
# white "KN" monogram — matches the amber "KavaNow" wordmark used across the app.
#
# Outputs (all into packages/web/public, served by Vite at the site root):
#   favicon.svg          scalable, rounded badge — preferred by modern browsers
#   favicon.ico          16/32/48 legacy fallback (rounded badge)
#   apple-touch-icon.png 180px full-bleed (iOS rounds the corners itself)
#   icon-192.png         192px full-bleed, manifest "any maskable"
#   icon-512.png         512px full-bleed, manifest + Google OAuth consent logo (§1.7)
#
# Requires: rsvg-convert (librsvg) + magick (ImageMagick). Run from anywhere:
#   packages/web/scripts/generate-icons.sh
set -euo pipefail

PUBLIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../public" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Shared pieces — keep the rounded (favicon.svg / in-app Logo.tsx) and full-bleed
# (maskable) variants visually identical apart from the corner radius.
GRAD='<defs><linearGradient id="kava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs>'
GLYPH='<g fill="none" stroke="#ffffff" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"><path d="M126 165V347"/><path d="M221 165L141 256 221 347"/><path d="M296 347L296 165 386 347 386 165"/></g>'

rounded_svg="$TMP/rounded.svg"
fullbleed_svg="$TMP/fullbleed.svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s<rect width="512" height="512" rx="112" fill="url(#kava)"/>%s</svg>\n' "$GRAD" "$GLYPH" >"$rounded_svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s<rect width="512" height="512" fill="url(#kava)"/>%s</svg>\n' "$GRAD" "$GLYPH" >"$fullbleed_svg"

# Pretty-print the rounded source as the committed favicon.svg.
cat >"$PUBLIC_DIR/favicon.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">
  <defs>
    <linearGradient id="kava" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f59e0b" />
      <stop offset="1" stop-color="#d97706" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#kava)" />
  <g fill="none" stroke="#ffffff" stroke-width="42" stroke-linecap="round" stroke-linejoin="round">
    <path d="M126 165V347" />
    <path d="M221 165L141 256 221 347" />
    <path d="M296 347L296 165 386 347 386 165" />
  </g>
</svg>
SVG

# Full-bleed PNGs (iOS / PWA maskable / OAuth consent).
rsvg-convert -w 180 -h 180 "$fullbleed_svg" -o "$PUBLIC_DIR/apple-touch-icon.png"
rsvg-convert -w 192 -h 192 "$fullbleed_svg" -o "$PUBLIC_DIR/icon-192.png"
rsvg-convert -w 512 -h 512 "$fullbleed_svg" -o "$PUBLIC_DIR/icon-512.png"

# Rounded PNGs → multi-resolution favicon.ico.
rsvg-convert -w 16 -h 16 "$rounded_svg" -o "$TMP/16.png"
rsvg-convert -w 32 -h 32 "$rounded_svg" -o "$TMP/32.png"
rsvg-convert -w 48 -h 48 "$rounded_svg" -o "$TMP/48.png"
magick "$TMP/16.png" "$TMP/32.png" "$TMP/48.png" "$PUBLIC_DIR/favicon.ico"

echo "Wrote icons to $PUBLIC_DIR"
