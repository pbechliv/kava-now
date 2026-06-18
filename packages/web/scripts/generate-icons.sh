#!/usr/bin/env bash
# Regenerate the KavaNow favicon/app-icon set from a single SVG source of truth.
#
# Brand mark: amber squircle (subtle top-lit gradient around brand amber-600
# #d97706, matching the `text-primary` wordmark) with a white amphora lifted by
# a soft shadow — the ancient Greek vessel that shipped wine across the
# Mediterranean, i.e. the original κάβα logistics. A partial-width "pottery
# band" is cut out of the belly via mask so the silhouette stays connected at
# small sizes. The depth (gradient + faint sheen + lift shadow) follows iOS
# icon conventions; keep it gentle so it survives to the 16px favicon. Keep the
# artwork in sync with src/components/Logo.tsx.
#
# Outputs (all into packages/web/public, served by Vite at the site root):
#   favicon.svg               scalable, rounded badge — preferred by modern browsers
#   favicon.ico               16/32/48 legacy fallback (rounded badge)
#   apple-touch-icon.png      180px full-bleed (iOS rounds the corners itself)
#   apple-touch-icon-dark.png 180px full-bleed dark variant — iOS has no native
#                             dark-icon support for web apps, so index.html swaps
#                             the <link> href via prefers-color-scheme before the
#                             user taps "Add to Home Screen"
#   icon-192.png              192px full-bleed, manifest "any maskable"
#   icon-512.png              512px full-bleed, manifest + Google OAuth consent logo (§1.7)
#
# Requires: rsvg-convert (librsvg) + magick (ImageMagick). Run from anywhere:
#   packages/web/scripts/generate-icons.sh
set -euo pipefail

PUBLIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../public" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Shared pieces — keep the rounded (favicon.svg / in-app Logo.tsx) and full-bleed
# (maskable) variants visually identical apart from the corner radius.
DARK_GLYPH='#f59e0b' # amber-500 amphora — amber-600 sits too dark on a dark ground

# Shared SVG fragments. defs (mask + gradients + lift filter) differ only by
# background gradient between the light and dark grounds.
MASK='<mask id="band"><rect width="512" height="512" fill="#fff"/><rect x="194" y="302" width="124" height="11" rx="5.5" fill="#000"/></mask>'
SHEEN='<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.42" stop-color="#fff" stop-opacity="0"/></linearGradient>'
LIFT='<filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#7a3d00" flood-opacity="0.28"/></filter>'
BG_LIGHT='<linearGradient id="bg" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e6870f"/><stop offset="1" stop-color="#c66405"/></linearGradient>'
BG_DARK='<linearGradient id="bg" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#241e1a"/><stop offset="1" stop-color="#15110f"/></linearGradient>'
DEFS_LIGHT="<defs>${MASK}${BG_LIGHT}${SHEEN}${LIFT}</defs>"
DEFS_DARK="<defs>${MASK}${BG_DARK}${SHEEN}${LIFT}</defs>"

# Painted ground: gradient fill + sheen overlay (rounded keeps the rx=112 squircle).
BG_ROUNDED='<rect width="512" height="512" rx="112" fill="url(#bg)"/><rect width="512" height="512" rx="112" fill="url(#sheen)"/>'
BG_SQUARE='<rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#sheen)"/>'

GLYPH='<g mask="url(#band)" filter="url(#lift)" transform="translate(256 256) scale(1.08) translate(-256 -256)"><rect x="210" y="92" width="92" height="27" rx="13" fill="#fff"/><path fill="#fff" d="M226 119 L286 119 C286 158 288 176 294 192 C336 208 352 226 352 254 C352 304 318 348 284 364 L284 382 L228 382 L228 364 C194 348 160 304 160 254 C160 226 176 208 218 192 C224 176 226 158 226 119 Z"/><path fill="#fff" d="M230 390 L282 390 C282 400 290 405 302 408 C310 410 314 414 314 419 L198 419 C198 414 202 410 210 408 C222 405 230 400 230 390 Z"/><g fill="none" stroke="#fff" stroke-width="23" stroke-linecap="round"><path d="M286 148 C316 150 332 166 332 190 C332 216 320 232 300 242"/><path d="M226 148 C196 150 180 166 180 190 C180 216 192 232 212 242"/></g></g>'

rounded_svg="$TMP/rounded.svg"
fullbleed_svg="$TMP/fullbleed.svg"
fullbleed_dark_svg="$TMP/fullbleed-dark.svg"
GLYPH_DARK="${GLYPH//\#fff/$DARK_GLYPH}" # recolor the amphora only; mask/defs live elsewhere
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s%s%s</svg>\n' "$DEFS_LIGHT" "$BG_ROUNDED" "$GLYPH" >"$rounded_svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s%s%s</svg>\n' "$DEFS_LIGHT" "$BG_SQUARE" "$GLYPH" >"$fullbleed_svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">%s%s%s</svg>\n' "$DEFS_DARK" "$BG_SQUARE" "$GLYPH_DARK" >"$fullbleed_dark_svg"

# Pretty-print the rounded source as the committed favicon.svg.
cat >"$PUBLIC_DIR/favicon.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="KavaNow">
  <defs>
    <mask id="band">
      <rect width="512" height="512" fill="#fff" />
      <rect x="194" y="302" width="124" height="11" rx="5.5" fill="#000" />
    </mask>
    <!-- subtle top-lit gradient (midpoint ≈ brand amber-600 #d97706) -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#e6870f" />
      <stop offset="1" stop-color="#c66405" />
    </linearGradient>
    <!-- faint specular sheen across the top edge -->
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0.1" />
      <stop offset="0.42" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
    <!-- soft drop shadow lifting the amphora off the surface -->
    <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#7a3d00" flood-opacity="0.28" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)" />
  <rect width="512" height="512" rx="112" fill="url(#sheen)" />
  <g mask="url(#band)" filter="url(#lift)" transform="translate(256 256) scale(1.08) translate(-256 -256)">
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
rsvg-convert -w 180 -h 180 "$fullbleed_dark_svg" -o "$PUBLIC_DIR/apple-touch-icon-dark.png"
rsvg-convert -w 192 -h 192 "$fullbleed_svg" -o "$PUBLIC_DIR/icon-192.png"
rsvg-convert -w 512 -h 512 "$fullbleed_svg" -o "$PUBLIC_DIR/icon-512.png"

# Rounded PNGs → multi-resolution favicon.ico.
rsvg-convert -w 16 -h 16 "$rounded_svg" -o "$TMP/16.png"
rsvg-convert -w 32 -h 32 "$rounded_svg" -o "$TMP/32.png"
rsvg-convert -w 48 -h 48 "$rounded_svg" -o "$TMP/48.png"
magick "$TMP/16.png" "$TMP/32.png" "$TMP/48.png" "$PUBLIC_DIR/favicon.ico"

echo "Wrote icons to $PUBLIC_DIR"
