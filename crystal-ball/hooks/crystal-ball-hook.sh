#!/bin/bash
# Crystal Ball — Multi-event Claude Code hook
#
# Handles: PostToolUse, Stop, UserPromptSubmit, SessionStart, SessionEnd
# Writes sidecar JSON to a central directory so the Crystal Ball server
# can enrich unit visualizations with real-time context (Mode 2).
#
# Install: run hooks/install-hooks.sh, or add manually to ~/.claude/settings.json

set -euo pipefail

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "PostToolUse"')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Central sidecar directory (configurable via env var)
SIDECAR_DIR="${CRYSTAL_BALL_DIR:-$HOME/.crystal-ball/sessions}"
mkdir -p "$SIDECAR_DIR"

SIDECAR_FILE="$SIDECAR_DIR/$SESSION_ID.json"

# ---------------------------------------------------------------------------
# Helper: read existing fields from the sidecar (if it exists)
# ---------------------------------------------------------------------------
read_existing() {
  if [ -f "$SIDECAR_FILE" ]; then
    jq -r ".$1 // \"\"" "$SIDECAR_FILE" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

# ---------------------------------------------------------------------------
# Helper: atomic write sidecar
# ---------------------------------------------------------------------------
write_sidecar() {
  local task="$1" phase="$2" blocked="$3" detail="$4"
  local TMPFILE="$SIDECAR_FILE.tmp"
  jq -n \
    --arg session_id "$SESSION_ID" \
    --arg cwd "$CWD" \
    --arg task "$task" \
    --arg phase "$phase" \
    --argjson blocked "$blocked" \
    --arg detail "$detail" \
    --arg updated_at "$TIMESTAMP" \
    '{session_id: $session_id, cwd: $cwd, task: $task, phase: $phase, blocked: $blocked, detail: $detail, updated_at: $updated_at}' \
    > "$TMPFILE" && mv "$TMPFILE" "$SIDECAR_FILE"
}

# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------

case "$EVENT" in

  # -------------------------------------------------------------------------
  # SessionStart — create a fresh sidecar
  # -------------------------------------------------------------------------
  SessionStart)
    write_sidecar "Working on project" "planning" "false" "Session starting..."
    ;;

  # -------------------------------------------------------------------------
  # PostToolUse — Claude is actively working. Infer phase, set blocked=false.
  # -------------------------------------------------------------------------
  PostToolUse)
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

    # Infer phase from tool name
    case "$TOOL_NAME" in
      Read|Grep|Glob|WebSearch|WebFetch)
        PHASE="researching" ;;
      Write|Edit|NotebookEdit)
        PHASE="coding" ;;
      Bash)
        CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
        if echo "$CMD" | grep -qiE 'test|pytest|jest|vitest|spec|node --test'; then
          PHASE="testing"
        elif echo "$CMD" | grep -qiE 'git diff|git log|git show'; then
          PHASE="reviewing"
        elif echo "$CMD" | grep -qiE 'git commit|git push|git add'; then
          PHASE="reviewing"
        else
          PHASE="coding"
        fi ;;
      Task|TaskCreate|TaskUpdate|TaskList|EnterPlanMode|ExitPlanMode)
        PHASE="planning" ;;
      AskUserQuestion)
        PHASE="planning" ;;
      *)
        PHASE="coding" ;;
    esac

    # Infer detail from tool input
    DETAIL=$(echo "$INPUT" | jq -r '
      if .tool_input.file_path then "Working on " + (.tool_input.file_path | split("/") | last)
      elif .tool_input.command then "Running: " + (.tool_input.command | .[0:60])
      elif .tool_input.pattern then "Searching: " + (.tool_input.pattern | .[0:40])
      elif .tool_input.query then "Searching: " + (.tool_input.query | .[0:40])
      elif .tool_input.prompt then "Agent: " + (.tool_input.prompt | .[0:40])
      elif .tool_name then "Using " + .tool_name
      else "Working..."
      end')

    # Preserve existing task
    EXISTING_TASK=$(read_existing "task")
    TASK="${EXISTING_TASK:-Working on project}"

    write_sidecar "$TASK" "$PHASE" "false" "$DETAIL"
    ;;

  # -------------------------------------------------------------------------
  # Stop — Claude finished responding, now waiting for user input.
  # -------------------------------------------------------------------------
  Stop)
    EXISTING_TASK=$(read_existing "task")
    EXISTING_PHASE=$(read_existing "phase")
    TASK="${EXISTING_TASK:-Working on project}"
    PHASE="${EXISTING_PHASE:-idle}"

    write_sidecar "$TASK" "$PHASE" "true" "Waiting for user input"
    ;;

  # -------------------------------------------------------------------------
  # UserPromptSubmit — User just typed something, Claude is about to work.
  # -------------------------------------------------------------------------
  UserPromptSubmit)
    EXISTING_TASK=$(read_existing "task")
    TASK="${EXISTING_TASK:-Working on project}"

    # Extract first 50 chars of the prompt as detail
    PROMPT_PREVIEW=$(echo "$INPUT" | jq -r '.prompt // "" | .[0:50]')
    DETAIL="Processing: ${PROMPT_PREVIEW}..."

    write_sidecar "$TASK" "planning" "false" "$DETAIL"
    ;;

  # -------------------------------------------------------------------------
  # SessionEnd — Clean up the sidecar file.
  # -------------------------------------------------------------------------
  SessionEnd)
    rm -f "$SIDECAR_FILE" "$SIDECAR_FILE.tmp"
    ;;

  # -------------------------------------------------------------------------
  # Notification (idle_prompt) — Reinforce blocked state after 60s idle.
  # -------------------------------------------------------------------------
  Notification)
    EXISTING_TASK=$(read_existing "task")
    EXISTING_PHASE=$(read_existing "phase")
    TASK="${EXISTING_TASK:-Working on project}"
    PHASE="${EXISTING_PHASE:-idle}"

    write_sidecar "$TASK" "$PHASE" "true" "Waiting for user input"
    ;;

  *)
    # Unknown event — ignore silently
    ;;
esac

exit 0
