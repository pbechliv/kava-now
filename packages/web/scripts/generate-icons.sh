#!/usr/bin/env bash
# Regenerate the KavaNow favicon/app-icon set from a single SVG source of truth.
#
# Brand mark: amber squircle (amber-500 #f59e0b → amber-600 #d97706) with a
# white amphora — the ancient Greek vessel that shipped wine across the
# Mediterranean, i.e. the original κάβα logistics. A partial-width "pottery
# band" is cut out of the belly via mask so the silhouette stays connected at
# small sizes. Keep the artwork in sync with src/components/Logo.tsx.
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
DEFS='<defs><linearGradient id="kava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#d97706"/></linearGradient><mask id="band"><rect width="512" height="512" fill="#fff"/><rect x="194" y="302" width="124" height="11" rx="5.5" fill="#000"/></mask></defs>'
GLYPH='<g mask="url(#band)" transform="translate(256 256) scale(1.08) translate(-256 -256)"><rect x="210" y="92" width="92" height="27" rx="13" fill="#fff"/><path fill="#fff" d="M226 119 L286 119 C286 158 288 176 294 192 C336 208 352 226 352 254 C352 304 318 348 284 364 L284 382 L228 382 L228 364 C194 348 160 304 160 254 C160 226 176 208 218 192 C224 176 226 158 226 119 Z"/><path fill="#fff" d="M230 390 L282 390 C282 400 290 405 302 408 C310 410 314 414 314 419 L198 419 C198 414 202 410 210 408 C222 405 230 400 230 390 Z"/><g fill="none" stroke="#fff" stroke-width="23" stroke-linecap="round"><path d="M286 148 C316 150 332 166 332 190 C332 216 320 232 300 242"/><path d="M226 148 C196 150 180 166 180 190 C180 216 192 232 212 242"/></g></g>'

rounded_svg="$TMP/rounded.svg"
fullbleed_svg="$TMP/fullbleed.svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s<rect width="512" height="512" rx="112" fill="url(#kava)"/>%s</svg>\n' "$DEFS" "$GLYPH" >"$rounded_svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s<rect width="512" height="512" fill="url(#kava)"/>%s</svg>\n' "$DEFS" "$GLYPH" >"$fullbleed_svg"

# Pretty-print the rounded source as the committed favicon.svg.
cat >"$PUBLIC_DIR/favicon.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">
  <defs>
    <linearGradient id="kava" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f59e0b" />
      <stop offset="1" stop-color="#d97706" />
    </linearGradient>
    <mask id="band">
      <rect width="512" height="512" fill="#fff" />
      <rect x="194" y="302" width="124" height="11" rx="5.5" fill="#000" />
    </mask>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#kava)" />
  <g mask="url(#band)" transform="translate(256 256) scale(1.08) translate(-256 -256)">
    <rect x="210" y="92" width="92" height="27" rx="13" fill="#fff" />
    <path fill="#fff" d="M226 119 L286 119 C286 158 288 176 294 192 C336 208 352 226 352 254 C352 304 318 348 284 364 L284 382 L228 382 L228 364 C194 348 160 304 160 254 C160 226 176 208 218 192 C224 176 226 158 226 119 Z" />
    <path fill="#fff" d="M230 390 L282 390 C282 400 290 405 302 408 C310 410 314 414 314 419 L198 419 C198 414 202 410 210 408 C222 405 230 400 230 390 Z" />
    <g fill="none" stroke="#fff" stroke-width="23" stroke-linecap="round">
      <path d="M286 148 C316 150 332 166 332 190 C332 216 320 232 300 242" />
      <path d="M226 148 C196 150 180 166 180 190 C180 216 192 232 212 242" />
    </g>
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
