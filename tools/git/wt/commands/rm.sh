# shellcheck shell=bash
#
# wt rm — remove the current worktree, tear down its isolated Docker stack, and
# close its cmux workspace. Sourced by wt.sh.

cmd_rm() {
  local force=0 delete_branch=0 arg
  for arg in "$@"; do
    case "$arg" in
      --force | -f) force=1 ;;
      --delete-branch) delete_branch=1 ;;
      -h | --help)
        usage
        return 0
        ;;
      *) die "unknown option: $arg (usage: wt rm [--force] [--delete-branch])" ;;
    esac
  done

  local worktree_abs primary_abs branch upstream refs
  worktree_abs="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git worktree."
  worktree_abs="$(cd "$worktree_abs" && pwd -P)"
  primary_abs="$(primary_worktree)"
  [[ "$worktree_abs" == "$primary_abs" ]] && die "Refusing to remove the primary worktree ($primary_abs)."

  branch="$(git -C "$worktree_abs" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  [[ "$branch" == "HEAD" ]] && branch="" # detached HEAD — no branch to check/delete

  # Safety guards (override with --force).
  if [[ "$force" -ne 1 ]]; then
    # Uncommitted changes would be lost when the working tree is removed.
    [[ -n "$(git -C "$worktree_abs" status --porcelain)" ]] &&
      die "Worktree has uncommitted changes. Commit/stash them or pass --force."
    # Push-state only matters when we ALSO delete the branch — a plain worktree
    # removal keeps the branch and all its commits, so there's nothing to lose.
    if [[ "$delete_branch" -eq 1 && -n "$branch" ]]; then
      if upstream="$(git -C "$worktree_abs" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
        [[ -n "$(git -C "$worktree_abs" log --oneline "$upstream..HEAD" 2>/dev/null)" ]] &&
          die "Branch '$branch' has unpushed commits (ahead of $upstream). Push them or pass --force."
      else
        die "Branch '$branch' has no upstream (never pushed). Pass --force to delete it anyway."
      fi
    fi
  fi

  # Tear down this worktree's isolated Docker stack (its own COMPOSE_PROJECT_NAME =>
  # its own containers + volume). Best-effort and done BEFORE the worktree is removed,
  # since we need its compose file + .env. `down -v` drops the per-worktree pg volume so
  # it doesn't leak. Guarded by `have docker`; never aborts the removal.
  local compose_file="$worktree_abs/docker-compose.dev.yml"
  local wt_env="$worktree_abs/.env"
  if have docker && [[ -f "$compose_file" && -f "$wt_env" ]]; then
    local project
    project="$(grep -E '^COMPOSE_PROJECT_NAME=' "$wt_env" 2>/dev/null | sed -n '1s/^[^=]*=//p' || true)"
    if [[ -n "$project" ]]; then
      log "Tearing down Docker stack '$project' (down -v)..."
      docker compose --project-name "$project" --env-file "$wt_env" -f "$compose_file" down -v >/dev/null 2>&1 ||
        warn "Could not tear down Docker stack '$project' (continuing)."
    fi
  fi

  # Find cmux workspace(s) whose directory is this worktree (or a subdir of it).
  refs=""
  if have cmux; then
    if ! have jq; then
      warn "jq not found — removing the worktree only; close its cmux workspace manually (install jq to automate)."
    else
      refs="$(CMUX_QUIET=1 cmux list-workspaces --json 2>/dev/null |
        jq -r --arg d "$worktree_abs" \
          '.workspaces[] | select(.current_directory == $d or (.current_directory | startswith($d + "/"))) | .ref' \
        2>/dev/null || true)"
    fi
  fi

  # Step out of the worktree before removing it (git refuses to remove the cwd, and we
  # don't want this process holding a handle on the directory being deleted).
  cd "$primary_abs"
  log "Removing worktree $worktree_abs"
  if [[ "$force" -eq 1 ]]; then
    git -C "$primary_abs" worktree remove --force "$worktree_abs"
  else
    git -C "$primary_abs" worktree remove "$worktree_abs"
  fi

  if [[ "$delete_branch" -eq 1 && -n "$branch" ]]; then
    if [[ "$force" -eq 1 ]]; then
      git -C "$primary_abs" branch -D "$branch" && log "Deleted branch '$branch'." ||
        warn "Could not delete branch '$branch'."
    else
      git -C "$primary_abs" branch -d "$branch" && log "Deleted branch '$branch'." ||
        warn "Could not delete branch '$branch' (not merged?). Use --force."
    fi
  elif [[ "$delete_branch" -eq 1 ]]; then
    warn "Detached HEAD — no branch to delete."
  fi

  # Close cmux workspace(s) LAST — closing the current one terminates this shell.
  if have cmux && [[ -n "$refs" ]]; then
    local ref
    for ref in $refs; do
      log "Closing cmux workspace $ref"
      CMUX_QUIET=1 cmux close-workspace --workspace "$ref" >/dev/null 2>&1 ||
        warn "Could not close cmux workspace $ref."
    done
  fi
}

interactive_rm() {
  local target confirm force_ans del_ans
  target="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$target" ]] || die "Not inside a git worktree."
  warn "About to remove worktree: $target"
  read -r -p "[wt] Proceed? [y/N]: " confirm
  case "$confirm" in
    y | Y | yes | YES) ;;
    *)
      log "Aborted."
      return 0
      ;;
  esac
  read -r -p "[wt] Force (ignore uncommitted/unpushed changes)? [y/N]: " force_ans
  read -r -p "[wt] Also delete the branch? [y/N]: " del_ans
  local args=()
  case "$force_ans" in y | Y | yes | YES) args+=(--force) ;; esac
  case "$del_ans" in y | Y | yes | YES) args+=(--delete-branch) ;; esac
  cmd_rm ${args[@]+"${args[@]}"}
}
