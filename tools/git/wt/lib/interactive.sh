# shellcheck shell=bash
#
# wt — interactive picker dispatcher (bare `wt` on a terminal). Sourced by wt.sh.
# The per-command prompts (interactive_new / interactive_setup / interactive_rm)
# live alongside their commands in commands/*.sh.

interactive() {
  log "Interactive mode — pick a command (Esc or Ctrl-C to cancel)."
  local choice
  if ! choice="$(menu_choose "wt >" new setup rm help quit)"; then
    log "Cancelled."
    return 0
  fi
  case "$choice" in
    new) interactive_new ;;
    setup) interactive_setup ;;
    rm) interactive_rm ;;
    help) usage ;;
    quit | "") log "Bye." ;;
    *) warn "unknown choice: $choice" ;;
  esac
}
