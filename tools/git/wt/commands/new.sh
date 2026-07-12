# shellcheck shell=bash
#
# wt new — create a branch + worktree, open a cmux workspace, then run setup.
# Sourced by wt.sh. Uses helpers from lib/common.sh, cmd_setup from commands/setup.sh,
# and $SCRIPT_DIR set by the wt.sh entry point.

cmd_new() {
  local no_group=0 skip_setup=0 claude_prompt=""
  local positional=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-group) no_group=1 ;;
      --no-setup) skip_setup=1 ;;
      # Inside cmux, --cmux-claude-prompt seeds a FRESH Claude session in the new workspace with
      # <text>; without it the workspace is a plain shell. The prompt is delivered via a temp
      # file so it can be multi-line (see the launch block below).
      --cmux-claude-prompt)
        shift
        [[ $# -gt 0 ]] || die "--cmux-claude-prompt requires a value"
        [[ -n "$1" ]] || die "--cmux-claude-prompt requires a non-empty value"
        # A bare value that looks like an option is almost certainly a misplaced flag
        # (e.g. `--cmux-claude-prompt --no-setup`); refuse it so the flag isn't silently
        # swallowed as the prompt. Use --cmux-claude-prompt=<text> for a prompt starting with '-'.
        [[ "$1" != -* ]] || die "--cmux-claude-prompt value looks like an option ('$1'); use --cmux-claude-prompt=<text> for a prompt starting with '-'"
        claude_prompt="$1"
        ;;
      --cmux-claude-prompt=*)
        claude_prompt="${1#--cmux-claude-prompt=}"
        [[ -n "$claude_prompt" ]] || die "--cmux-claude-prompt requires a non-empty value"
        ;;
      -h | --help)
        usage
        return 0
        ;;
      -*) die "unknown option: $1 (usage: wt new [--no-group] [--no-setup] [--cmux-claude-prompt <text>] <branch> [source-branch])" ;;
      *) positional+=("$1") ;;
    esac
    shift
  done
  local branch="${positional[0]:-}" source_ref="${positional[1]:-}"
  [[ -n "$branch" ]] || die "usage: wt new [--no-group] [--no-setup] [--cmux-claude-prompt <text>] <branch> [source-branch]"

  local primary_abs base dir worktree_abs title start
  primary_abs="$(primary_worktree)"
  base="${GIT_WORKTREE_BASE:-$(dirname "$primary_abs")/kava-now.worktrees}"
  mkdir -p "$base"
  # Derive the dir from the FULL branch (slashes -> dashes), not just the last
  # segment, so branches that share a leaf get distinct worktrees:
  # feature/pl-100-a -> feature-pl-100-a, bugfix/pl-100-a -> bugfix-pl-100-a.
  dir="${branch//\//-}"
  worktree_abs="$base/$dir"
  [[ -e "$worktree_abs" ]] && die "Target path already exists: $worktree_abs"

  log "Fetching origin..."
  git fetch -q origin --prune

  # Resolve the start point used when creating a brand-new branch.
  if [[ -z "$source_ref" ]]; then
    start="$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)"
  else
    case "$source_ref" in
      origin/* | refs/*) start="$source_ref" ;;
      *)
        if git show-ref --verify --quiet "refs/remotes/origin/$source_ref"; then
          start="origin/$source_ref"
        elif git show-ref --verify --quiet "refs/heads/$source_ref"; then
          start="$source_ref"
        else
          start="origin/$source_ref"
        fi
        ;;
    esac
  fi

  # Create or reuse the branch (mirrors the `git wt` alias semantics).
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    log "Reusing existing local branch '$branch'."
  elif git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    log "Creating tracking branch '$branch' from origin/$branch."
    git branch --track "$branch" "origin/$branch" >/dev/null 2>&1 || git branch "$branch" "origin/$branch"
    git branch --set-upstream-to="origin/$branch" "$branch" >/dev/null 2>&1 || true
  else
    log "Creating branch '$branch' from $start."
    git branch --no-track "$branch" "$start"
  fi

  log "Adding worktree at $worktree_abs"
  git worktree add "$worktree_abs" "$branch"
  worktree_abs="$(cd "$worktree_abs" && pwd -P)"

  if [[ "$skip_setup" -eq 1 ]]; then
    log "Skipping setup (--no-setup). Run 'pnpm wt setup' inside the worktree when ready."
  else
    log "Setting up the new worktree (copy + port-rewrite .env, link settings, then pnpm install)..."
    cmd_setup "$worktree_abs" ||
      warn "Worktree created but setup failed — run 'pnpm wt setup' in $worktree_abs."
  fi

  # Open the cmux workspace LAST, once the worktree is set up. `cmux new-workspace`
  # creates the workspace in the *caller's* cmux window, so it only works when this
  # script runs inside a cmux session (cmux sets CMUX_WORKSPACE_ID in its shells) —
  # from a plain terminal there's no caller window. If the call still fails, we surface
  # the error and continue; the worktree is already usable.
  title="$(slug_to_title "$branch")"
  if in_cmux; then
    local ws_args=(--name "$title" --cwd "$worktree_abs" --focus true)
    # With --cmux-claude-prompt, the new workspace starts a FRESH Claude session seeded with the
    # prompt; without it, it's a plain shell and you stay on the primary session. A fresh
    # session carries none of this conversation, so the prompt must be self-contained.
    local prompt_file=""
    if [[ -n "$claude_prompt" ]]; then
      # cmux --command TYPES this line into the new workspace's shell and presses Enter. cmux
      # sends one line + Enter, so a multi-line prompt can't be typed directly. Write it to a
      # temp file and have the NEW shell read it back via `$(cat …)`: the whole (possibly
      # multi-line) file becomes a single argument, and the prompt body is never typed into the
      # interactive shell — so `!`, `$`, backticks and globs in it stay literal. `; rm -f`
      # self-deletes the file right after it's read.
      prompt_file="$(mktemp "${TMPDIR:-/tmp}/wt-prompt.XXXXXX")" || die "mktemp failed"
      printf '%s' "$claude_prompt" >"$prompt_file"
      local qf
      qf="$(shell_squote "$prompt_file")"
      ws_args+=(--command "claude \"\$(cat $qf; rm -f $qf)\"")
    fi

    # Combine stdout+stderr so a failure reports the real reason. Keep `local cmux_out`
    # on its own line — a combined `local x=$(...)` masks the exit status behind local's.
    local cmux_out
    if cmux_out="$(CMUX_QUIET=1 cmux new-workspace "${ws_args[@]}" 2>&1)"; then
      if [[ -n "$claude_prompt" ]]; then
        log "Opened cmux workspace '$title' — started a fresh Claude session on your prompt."
      else
        log "Opened cmux workspace '$title'."
      fi
      local group="${WT_CMUX_GROUP-KavaNow}"
      if [[ "$no_group" -eq 1 || -z "$group" ]]; then
        log "Left workspace ungrouped (--no-group or empty WT_CMUX_GROUP)."
      elif ! have jq; then
        warn "jq not found — leaving the cmux workspace ungrouped (install jq for grouping)."
      else
        # The new workspace is now focused; confirm by cwd (guards against a focus
        # race), then file it under the configured group.
        local ws_id ws_cwd
        # `|| true`: best-effort — a cmux/jq failure must not abort `wt new` (set -e).
        ws_id="$(CMUX_QUIET=1 cmux --id-format uuids current-workspace 2>/dev/null | tr -d '[:space:]' || true)"
        ws_cwd="$(CMUX_QUIET=1 cmux current-workspace --json 2>/dev/null | jq -r '.workspace.current_directory // empty' 2>/dev/null || true)"
        if [[ -n "$ws_id" && "$ws_cwd" == "$worktree_abs" ]]; then
          cmux_group_add "$group" "$ws_id"
        else
          warn "Couldn't confirm the new cmux workspace; left it ungrouped."
        fi
      fi
    else
      warn "cmux new-workspace failed (continuing without a cmux workspace): ${cmux_out:-unknown error}"
      # The new shell never ran, so its self-delete didn't fire — clean up the temp file here.
      [[ -n "$prompt_file" ]] && rm -f "$prompt_file"
      [[ -n "$claude_prompt" ]] && warn "The fresh Claude session was not started, so --cmux-claude-prompt had no effect."
    fi
  elif have cmux; then
    log "Not inside a cmux session — skipping cmux workspace creation."
    [[ -n "$claude_prompt" ]] &&
      warn "--cmux-claude-prompt ignored: not inside a cmux session (a workspace is only opened from inside cmux)."
  else
    [[ -n "$claude_prompt" ]] &&
      warn "--cmux-claude-prompt ignored: cmux is not installed (no workspace to open)."
  fi

  log "Done. '$branch' -> $worktree_abs"
}

interactive_new() {
  local branch source_ref setup_ans claude_prompt
  read -r -p "[wt] New branch (e.g. fix/165-invite-onboarding): " branch
  [[ -n "$branch" ]] || die "branch name is required."
  read -r -p "[wt] Source branch [origin/main]: " source_ref
  read -r -p "[wt] Run setup now (copy + port-rewrite .env, link settings, pnpm install)? [Y/n]: " setup_ans
  local args=()
  case "$setup_ans" in n | N | no | NO) args+=(--no-setup) ;; esac
  # Inside cmux we can start a fresh Claude session in the new workspace on a task. Only ask
  # when in cmux (otherwise --cmux-claude-prompt is ignored). Single line here; rich/multi-line
  # prompts go through the flag form, e.g. --cmux-claude-prompt="$(cat task.md)".
  if in_cmux; then
    read -r -p "[wt] Task for a fresh Claude session in the new workspace (blank = plain shell): " claude_prompt
    [[ -n "$claude_prompt" ]] && args+=(--cmux-claude-prompt="$claude_prompt")
  fi
  args+=("$branch")
  [[ -n "$source_ref" ]] && args+=("$source_ref")
  cmd_new "${args[@]}"
}
