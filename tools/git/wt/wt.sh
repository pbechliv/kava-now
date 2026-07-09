#!/usr/bin/env bash
#
# wt — manage git worktrees together with their cmux workspaces (KavaNow).
#
# Run via the pnpm entry point: `pnpm wt <command>` (resolves to the current
# worktree's copy of this script). Run `pnpm wt` with no command (on a terminal)
# for an interactive picker.
#
#   pnpm wt new [--no-setup] <branch> [source-branch]
#                                         Create a branch + worktree, open a cmux
#                                         workspace, then run setup (--no-setup skips).
#   pnpm wt setup [--no-install] [path]
#                                         Set up a worktree: copy + port-rewrite .env,
#                                         link .claude/settings.local.json, then install.
#   pnpm wt rm [--force] [--delete-branch]
#                                         Remove the current worktree, tear down its
#                                         isolated Docker stack, and close its cmux
#                                         workspace.
#
# This file is the entry point: it resolves its own directory, sources the helpers
# and command implementations, then dispatches. The pieces live next to it:
#   lib/common.sh        logging, dependency checks, git/cmux/title helpers, menu
#   lib/usage.sh         the `usage` help text
#   lib/interactive.sh   the interactive picker dispatcher
#   commands/<cmd>.sh    one file per command (cmd_<cmd> + its interactive_ prompt)
#   setup-worktree.sh    standalone setup implementation (also runnable directly)
#
# cmux is an OPTIONAL dependency: every cmux call is guarded by `command -v cmux`.
# If cmux is not installed the worktree is still created/removed with no cmux
# output or warnings — the CLI never fails because of cmux.
#
# Env:
#   GIT_WORKTREE_BASE   Base dir for worktrees (default: <repo-parent>/kava-now.worktrees)
#   WT_CMUX_GROUP       cmux sidebar group for new workspaces (default: KavaNow; empty = none)
#
# cmux features (grouping, closing on `rm`) also need `jq`; without it the worktree
# is still created/removed, just without touching the cmux sidebar.
set -euo pipefail

# Resolve the script's own symlink (e.g. ~/bin/wt -> here) so the sibling files are
# sourced next to the real file, not next to the symlink.
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd -P)"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/usage.sh
source "$SCRIPT_DIR/lib/usage.sh"
# shellcheck source=commands/new.sh
source "$SCRIPT_DIR/commands/new.sh"
# shellcheck source=commands/setup.sh
source "$SCRIPT_DIR/commands/setup.sh"
# shellcheck source=commands/rm.sh
source "$SCRIPT_DIR/commands/rm.sh"
# shellcheck source=lib/interactive.sh
source "$SCRIPT_DIR/lib/interactive.sh"

main() {
  local cmd="${1:-}"
  case "$cmd" in
    new)
      shift
      cmd_new "$@"
      ;;
    setup)
      shift
      cmd_setup "$@"
      ;;
    rm)
      shift
      cmd_rm "$@"
      ;;
    -h | --help | help) usage ;;
    "")
      # Bare `wt` on a terminal launches the interactive picker; otherwise show usage.
      if [[ -t 0 && -t 1 ]]; then
        interactive
      else
        usage
      fi
      ;;
    *)
      warn "unknown command: $cmd"
      usage
      exit 2
      ;;
  esac
}

# Only auto-run when executed directly (so the functions can be sourced in tests).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
