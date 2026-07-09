# shellcheck shell=bash
#
# wt — shared helpers: logging, dependency checks, git/cmux/title utilities, and the
# interactive menu primitive. Sourced by wt.sh; not executed directly.

log() { echo "[wt] $*"; }
warn() { echo "[wt] $*" >&2; }
die() {
  echo "[wt] $*" >&2
  exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

# POSIX-safe single-quote escaping: wrap $1 in single quotes, turning every embedded
# single quote into the '\'' sequence. The result is safe to splice into a shell
# command line — e.g. cmux --command, which TYPES the text into the new workspace's
# shell and presses Enter, so the string is re-parsed by that interactive shell.
# Kept in unquoted parameter-expansion context on purpose: writing the '\'' replacement
# inside double quotes mangles the backslashes.
shell_squote() {
  local s=$1 out=
  while [[ $s == *\'* ]]; do
    out+=${s%%\'*}\'\\\'\'
    s=${s#*\'}
  done
  printf "'%s'" "$out$s"
}

# True when cmux is installed AND we're running inside a cmux session. cmux injects
# CMUX_WORKSPACE_ID into the shells of its workspaces; `cmux new-workspace` creates in
# the *caller's* window, so it only makes sense from inside cmux — a plain terminal has
# no caller window. Folds in `have cmux` so callers can just test `in_cmux`.
in_cmux() { have cmux && [[ -n "${CMUX_WORKSPACE_ID:-}" ]]; }

# Add a workspace (UUID) to a named cmux sidebar group, if that group exists.
# Best-effort: never fails the command, just logs.
cmux_group_add() {
  local group_name="$1" ws_id="$2" grp_id
  # `|| true`: cmux grouping is best-effort — a jq/cmux failure here (pipefail under
  # set -e) must never abort the caller.
  grp_id="$(CMUX_QUIET=1 cmux rpc workspace.group.list 2>/dev/null |
    jq -r --arg n "$group_name" '.groups[] | select(.name == $n) | .id' 2>/dev/null | sed -n '1p' || true)"
  if [[ -z "$grp_id" ]]; then
    log "No cmux group named '$group_name' found — workspace left ungrouped."
    return 0
  fi
  if CMUX_QUIET=1 cmux rpc workspace.group.add "{\"group_id\":\"$grp_id\",\"workspace_id\":\"$ws_id\"}" >/dev/null 2>&1; then
    log "Added workspace to cmux group '$group_name'."
  else
    warn "Could not add workspace to cmux group '$group_name' (continuing)."
  fi
}

# Absolute path of the primary (main) worktree — first entry of `git worktree list`.
primary_worktree() {
  local line
  # sed (not `head -1`) so git isn't SIGPIPE'd mid-write — with many worktrees and
  # `pipefail` that would fail this command substitution under `set -e`.
  line="$(git worktree list --porcelain | sed -n '1p')"
  [[ "$line" == worktree* ]] || die "Could not determine the primary worktree."
  (cd "${line#worktree }" && pwd -P)
}

# Uppercase the first character, leave the rest untouched (bash 3.2 compatible).
capitalize() {
  local w="$1"
  [[ -z "$w" ]] && return 0
  printf '%s%s' "$(printf '%s' "${w:0:1}" | tr '[:lower:]' '[:upper:]')" "${w:1}"
}

# "hello-there" / "hello_there" -> "Hello There"
titlecase_words() {
  local input word out=""
  input="$(printf '%s' "$1" | tr '_-' '  ')"
  for word in $input; do
    out="$out $(capitalize "$word")"
  done
  printf '%s' "${out# }"
}

# Branch slug -> cmux workspace title.
#   feature/pl-912-hello-there -> "PL-912 Hello There"
#   fix/165-invite-onboarding  -> "#165 Invite Onboarding"  (bare issue number)
slug_to_title() {
  local slug="${1##*/}" team num rest
  if [[ "$slug" =~ ^([A-Za-z]+)-([0-9]+)(-(.*))?$ ]]; then
    team="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')"
    num="${BASH_REMATCH[2]}"
    rest="${BASH_REMATCH[4]}"
    if [[ -n "$rest" ]]; then
      printf '%s-%s %s' "$team" "$num" "$(titlecase_words "$rest")"
    else
      printf '%s-%s' "$team" "$num"
    fi
  elif [[ "$slug" =~ ^([0-9]+)(-(.*))?$ ]]; then
    num="${BASH_REMATCH[1]}"
    rest="${BASH_REMATCH[3]}"
    if [[ -n "$rest" ]]; then
      printf '#%s %s' "$num" "$(titlecase_words "$rest")"
    else
      printf '#%s' "$num"
    fi
  else
    titlecase_words "$slug"
  fi
}

# Print the chosen option to stdout and return 0. Return NON-ZERO if the user cancels
# (fzf: Esc/Ctrl-C; select: Ctrl-D/EOF) so callers can abort instead of falling back
# to a default. Uses fzf when available, otherwise the bash `select` builtin.
menu_choose() {
  local prompt="$1"
  shift
  if have fzf; then
    # Capture the selection and fzf's exit code without tripping `set -e`: fzf exits
    # non-zero (130) on Esc/Ctrl-C, which we propagate to the caller as "cancelled".
    local sel rc=0
    sel="$(printf '%s\n' "$@" | fzf --prompt="$prompt " --height=40% --reverse --no-multi)" || rc=$?
    printf '%s' "$sel"
    return "$rc"
  fi
  local opt
  local PS3="$prompt "
  select opt in "$@"; do
    if [[ -n "$opt" ]]; then
      printf '%s' "$opt"
      return 0
    fi
  done
  # `select` loop ended without a choice (Ctrl-D / EOF) -> treat as cancelled.
  return 1
}
