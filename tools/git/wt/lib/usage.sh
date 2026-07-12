# shellcheck shell=bash
#
# wt — `usage` help text. Sourced by wt.sh.

usage() {
  cat <<'EOF'
wt — manage git worktrees together with their cmux workspaces (KavaNow).

Each worktree gets FULL isolation: its own copy of .env with a unique port offset
(Postgres / Mailpit SMTP / Mailpit UI / API / Web) and its own Docker COMPOSE_PROJECT_NAME
(hence its own containers + volume). Two worktrees can run `pnpm dev` side by side.

Usage (via the pnpm entry point):
  pnpm wt new [--no-group] [--no-setup] [--cmux-claude-prompt <text>] <branch> [src]
                                             Create branch + worktree, open cmux workspace, then run setup (--no-setup skips).
                                             Inside cmux, --cmux-claude-prompt <text> opens the new workspace on a FRESH Claude session
                                             seeded with <text> (multi-line OK). Without it, the new workspace is a plain shell.
  pnpm wt setup [--no-install] [path]        Set up a worktree: copy + port-rewrite .env, link .claude/settings.local.json, then install.
  pnpm wt rm [--force] [--delete-branch]     Remove the current worktree, tear down its Docker stack (down -v), close its cmux workspace.
  pnpm wt                                    Interactive picker (new / setup / rm).
  pnpm wt -h | --help

Examples:
  pnpm wt new fix/165-invite-onboarding             # source defaults to origin/main
  pnpm wt new feature/catalog-search main
  pnpm wt new --no-setup fix/42                      # create the worktree but skip setup
  pnpm wt new fix/42 --cmux-claude-prompt "implement the fix on this branch"   # fresh Claude session in the new workspace
  pnpm wt new fix/42 --cmux-claude-prompt="$(cat task.md)"                      # pass a rich, multi-line task/context prompt
  pnpm wt setup                                      # copy + port-rewrite .env, link settings, pnpm install
  pnpm wt setup --no-install                         # wire up the worktree but skip pnpm install
  pnpm wt rm                                         # run from inside the worktree
  pnpm wt rm --force --delete-branch

Env:
  GIT_WORKTREE_BASE   Base dir for worktrees (default: <repo-parent>/kava-now.worktrees)
  WT_CMUX_GROUP       cmux sidebar group to file new workspaces under (default: KavaNow; empty = none)

cmux is optional; if it is not installed the worktree is still created/removed.
EOF
}
