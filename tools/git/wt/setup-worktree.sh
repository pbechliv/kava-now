#!/usr/bin/env bash
#
# Set up a git worktree's local environment for FULL isolation from every other
# worktree (KavaNow):
#   - copy .env from the primary worktree, then rewrite it to a unique port offset
#     (Postgres / Mailpit SMTP / Mailpit UI / API / Web) and give it its own Docker
#     COMPOSE_PROJECT_NAME — so the worktree gets its own containers + volume and can
#     run `pnpm dev` at the same time as the primary and other worktrees.
#   - symlink .claude/settings.local.json (shared local Claude settings)
#   - install dependencies (pnpm install)
#
# .env MUST be a per-worktree copy (not a symlink): each worktree points at its own
# Postgres/Mailpit ports. The primary worktree is never rewritten — it keeps the
# defaults (5432 / 1025 / 8025 / 3300 / 3200), so nothing about it changes.
#
# Run this explicitly (e.g. via `pnpm wt setup`) when you want to prepare a worktree.
# It is NOT run automatically on worktree creation.
#
# Usage: tools/git/wt/setup-worktree.sh [--include LIST] [--no-install] [worktree-path]
#   --include LIST   Comma-separated components to bring in: env,claude
#                    (default: env,claude).
#   --no-install     Skip `pnpm install`.
#   worktree-path    Target worktree (default: current worktree root).
#
# Env:
#   WT_SKIP_INSTALL=1   Skip `pnpm install` (same as --no-install).
set -euo pipefail

INCLUDE="env,claude"
RUN_INSTALL=1
target=""

usage() {
  cat <<'EOF'
Set up a git worktree for full isolation from every other worktree:
  - copy .env from the primary, then rewrite it to a unique port offset + COMPOSE_PROJECT_NAME
  - symlink .claude/settings.local.json
  - pnpm install

Usage: tools/git/wt/setup-worktree.sh [--include LIST] [--no-install] [worktree-path]
  --include LIST   Components to bring in: env,claude (default: env,claude).
  --no-install     Skip pnpm install.
  worktree-path    Target worktree (default: current worktree root).

Env:
  WT_SKIP_INSTALL=1   Skip pnpm install (same as --no-install).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include)
      if [[ $# -lt 2 ]]; then
        echo "[setup-worktree] --include requires a value (e.g. env,claude)" >&2
        exit 2
      fi
      shift
      INCLUDE="$1"
      ;;
    --include=*) INCLUDE="${1#*=}" ;;
    --no-install) RUN_INSTALL=0 ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "[setup-worktree] unknown option: $1" >&2
      exit 2
      ;;
    *) target="$1" ;;
  esac
  shift
done

# Validate the --include tokens up front.
for tok in ${INCLUDE//,/ }; do
  case "$tok" in
    env | claude) ;;
    *)
      echo "[setup-worktree] --include token must be one of env|claude (got '$tok')" >&2
      exit 2
      ;;
  esac
done

# True when $1 is one of the comma-separated --include tokens.
includes() {
  case ",$INCLUDE," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

target="${target:-$(git rev-parse --show-toplevel)}"
current_abs="$(cd "$target" && pwd -P)"

# The first line of "git worktree list --porcelain" is always the primary worktree.
# Use sed (not `head -1`) so git isn't SIGPIPE'd mid-write, which with `pipefail`
# would fail this command substitution under `set -e` when there are many worktrees.
primary_line="$(git -C "$current_abs" worktree list --porcelain | sed -n '1p')"
if [[ "$primary_line" != worktree* ]]; then
  echo "[setup-worktree] Could not determine the primary worktree. Aborting." >&2
  exit 1
fi
primary_abs="$(cd "${primary_line#worktree }" 2>/dev/null && pwd -P || true)"
if [[ -z "$primary_abs" ]]; then
  echo "[setup-worktree] Primary worktree path not found. Aborting." >&2
  exit 1
fi

# --- Default host ports (must match docker-compose.dev.yml + the app defaults). ---
PG_BASE=5432
SMTP_BASE=1025
MAILUI_BASE=8025
API_BASE=3300
WEB_BASE=3200

# 0 = free (nothing listening on 127.0.0.1:$1), 1 = in use.
port_free() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && {
    exec 3>&- 3<&- 2>/dev/null || true
    return 1
  }
  return 0
}

# Offsets already assigned to other worktrees (read from their .env WORKTREE_PORT_OFFSET).
used_offsets() {
  local wt env_file
  git -C "$current_abs" worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
    env_file="$wt/.env"
    [[ -f "$env_file" ]] || continue
    grep -E '^WORKTREE_PORT_OFFSET=' "$env_file" 2>/dev/null | sed -n '1s/^[^=]*=//p'
  done
}

# Pick the smallest offset N in 1..99 that isn't already assigned to another worktree
# AND whose five ports are all currently free. Prints N on success.
choose_offset() {
  local used n
  used=" $(used_offsets | tr '\n' ' ') "
  for n in $(seq 1 99); do
    case "$used" in *" $n "*) continue ;; esac
    if port_free $((PG_BASE + n)) && port_free $((SMTP_BASE + n)) &&
      port_free $((MAILUI_BASE + n)) && port_free $((API_BASE + n)) &&
      port_free $((WEB_BASE + n)); then
      printf '%s' "$n"
      return 0
    fi
  done
  return 1
}

get_env_val() { grep -E "^$1=" "$2" 2>/dev/null | sed -n "1s/^[^=]*=//p"; }

# Replace (or append) a KEY=VALUE line in an env file.
set_env_var() {
  local file="$1" key="$2" val="$3" tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" >"$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$val" >>"$tmp"
  mv "$tmp" "$file"
}

link_file() {
  local name="$1"
  local current_path="$current_abs/$name"
  local primary_path="$primary_abs/$name"
  if [[ ! -e "$primary_path" ]]; then
    echo "[setup-worktree] Primary worktree has no $name — skipping." >&2
    return 0
  fi
  mkdir -p "$(dirname "$current_path")"
  if [[ -e "$current_path" || -L "$current_path" ]]; then
    echo "[setup-worktree] Removing existing $name before linking..."
    rm -rf "$current_path"
  fi
  ln -s "$primary_path" "$current_path"
  echo "[setup-worktree] Linked $name -> $primary_path"
}

# Copy .env from the primary and rewrite it for full isolation.
provision_env() {
  local primary_env="$primary_abs/.env"
  local current_env="$current_abs/.env"
  if [[ ! -f "$primary_env" ]]; then
    echo "[setup-worktree] Primary worktree has no .env — create it there first. Skipping env." >&2
    return 0
  fi

  local offset
  if ! offset="$(choose_offset)"; then
    echo "[setup-worktree] Could not find a free port offset (1..99). Skipping env rewrite." >&2
    return 1
  fi

  local pg=$((PG_BASE + offset)) smtp=$((SMTP_BASE + offset)) mailui=$((MAILUI_BASE + offset))
  local api=$((API_BASE + offset)) web=$((WEB_BASE + offset))
  local project
  project="kavanow-$(basename "$current_abs" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')"
  # Trim any trailing '-' introduced by tr (e.g. from a trailing newline).
  project="${project%-}"

  echo "[setup-worktree] Copying .env from primary and applying port offset +$offset..."
  cp "$primary_env" "$current_env"

  # Rewrite the port-bearing values. DATABASE_URL / APP_ORIGIN keep the rest of their
  # value (creds, db name, scheme) and only swap the port.
  local db_url origin new_db new_origin
  db_url="$(get_env_val DATABASE_URL "$current_env")"
  origin="$(get_env_val APP_ORIGIN "$current_env")"
  new_db="${db_url/:$PG_BASE\//:$pg/}"
  new_origin="${origin/:$WEB_BASE/:$web}"
  if [[ "$new_db" == "$db_url" ]]; then
    echo "[setup-worktree] WARNING: DATABASE_URL had no ':$PG_BASE/' to rewrite — check it points at the worktree's Postgres." >&2
  fi
  if [[ "$new_origin" == "$origin" ]]; then
    echo "[setup-worktree] WARNING: APP_ORIGIN had no ':$WEB_BASE' to rewrite — check it matches the worktree's web port." >&2
  fi

  set_env_var "$current_env" DATABASE_URL "$new_db"
  set_env_var "$current_env" APP_ORIGIN "$new_origin"
  set_env_var "$current_env" SMTP_PORT "$smtp"
  set_env_var "$current_env" API_PORT "$api"

  # Vars read by docker-compose.dev.yml (host ports + project) and web vite (WEB_PORT).
  # COMPOSE_PROJECT_NAME gives this worktree its own containers + named volume.
  set_env_var "$current_env" WEB_PORT "$web"
  set_env_var "$current_env" POSTGRES_PORT "$pg"
  set_env_var "$current_env" MAILPIT_SMTP_PORT "$smtp"
  set_env_var "$current_env" MAILPIT_UI_PORT "$mailui"
  set_env_var "$current_env" COMPOSE_PROJECT_NAME "$project"
  set_env_var "$current_env" WORKTREE_PORT_OFFSET "$offset"

  echo "[setup-worktree] .env wired: project '$project' | pg $pg, smtp $smtp, mailUI $mailui, api $api, web $web"
}

if [[ "$current_abs" == "$primary_abs" ]]; then
  echo "[setup-worktree] $current_abs is the primary worktree; leaving its .env untouched."
else
  if includes env; then
    provision_env || true
  fi
  if includes claude; then
    link_file ".claude/settings.local.json"
  fi
fi

if [[ "$RUN_INSTALL" != "1" ]]; then
  echo "[setup-worktree] Skipping pnpm install (--no-install)."
elif [[ "${WT_SKIP_INSTALL:-}" == "1" ]]; then
  echo "[setup-worktree] WT_SKIP_INSTALL=1 set; skipping pnpm install."
else
  echo "[setup-worktree] Installing dependencies (pnpm install)..."
  (cd "$current_abs" && pnpm install)
fi
