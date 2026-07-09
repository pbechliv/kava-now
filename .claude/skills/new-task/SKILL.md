---
name: new-task
description: Use when starting a new piece of work that should land as a PR — syncs main, cuts a fresh branch, implements (asking the user when the approach is uncertain), and opens a pull request.
---

# New Task → PR

## Overview

Start a task from a clean, up-to-date `main`, do the work on a dedicated branch, and finish by opening a PR.

**Core principle:** Never commit to `main` directly for this flow. Every task gets its own branch and its own PR. Pause for the user whenever the implementation is genuinely ambiguous — don't guess on design decisions.

**Announce at start:** "Using new-task to sync main, branch, and open a PR."

## The Process

### 1. Sync main

```bash
git checkout main
git pull
```

If the working tree is dirty, stop and ask the user how to proceed (stash, commit elsewhere, or discard) before switching branches — don't silently blow away uncommitted work.

### 2. Create a branch

Name it from the task: `<type>/<short-slug>` (e.g. `feat/customer-export`, `fix/order-total-rounding`). Match the prefix conventions already in the repo's history (`git log --oneline` shows `feat/`, `fix/`, `chore/`).

```bash
git checkout -b <type>/<short-slug>
```

If there's an associated issue number, include it: `fix/158-confirm-terminal-order-status`.

### 3. Assess certainty — ask if unclear

Before writing code, judge whether the implementation approach is obvious.

- **Clear** (one sensible approach, matches existing patterns) → implement directly.
- **Uncertain** (multiple viable designs, ambiguous requirements, a schema/API/UX decision, or anything irreversible) → **ask the user with AskUserQuestion before implementing.** Present the concrete choices, not open-ended questions. Do not proceed on a guess.

### 4. Implement

Do the work. Follow the repo conventions in `CLAUDE.md`. Run the quality gate before committing:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Only commit when the user has asked you to, or when finishing the task for the PR. End commit messages with the repo's Co-Authored-By trailer.

### 5. Open the PR

Push and open the PR with `gh`:

```bash
git push -u origin HEAD
gh pr create --fill
```

Write a real title and body — summary of the change and how it was verified. End the PR body with the Claude Code trailer. Return the PR URL to the user.

## Notes

- One task, one branch, one PR.
- The gate is local (`pnpm lint`/`typecheck`/`test`); pushes to a PR also trigger full CI.
- If the user says "just do it" or the change is trivial and unambiguous, skip step 3's question — but still branch and PR.
