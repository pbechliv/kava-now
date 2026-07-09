# shellcheck shell=bash
#
# wt setup — set up a worktree's environment. Thin wrapper over the sibling
# setup-worktree.sh (found via $SCRIPT_DIR, set by the wt.sh entry point).

cmd_setup() {
  # Delegate to the sibling setup script. It copies + port-rewrites .env, links
  # .claude/settings.local.json, and runs pnpm install (--no-install skips it).
  # Accepts an optional worktree-path (defaults to the current worktree).
  "$SCRIPT_DIR/setup-worktree.sh" "$@"
}

interactive_setup() {
  local install_ans
  read -r -p "[wt] Run pnpm install after wiring up the worktree? [Y/n]: " install_ans
  case "$install_ans" in
    n | N | no | NO) cmd_setup --no-install ;;
    *) cmd_setup ;;
  esac
}
