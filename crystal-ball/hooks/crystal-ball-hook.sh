#!/bin/bash
# Crystal Ball PostToolUse hook (async)
# Writes sidecar JSON to a central directory (not the project dir).
# Install: add to .claude/settings.json PostToolUse hooks.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Central sidecar directory (configurable via env var)
SIDECAR_DIR="${CRYSTAL_BALL_DIR:-$HOME/.crystal-ball/sessions}"
mkdir -p "$SIDECAR_DIR"

SIDECAR_FILE="$SIDECAR_DIR/$SESSION_ID.json"

# Infer phase from tool name
case "$TOOL_NAME" in
  Read|Grep|Glob|WebSearch|WebFetch) PHASE="researching" ;;
  Write|Edit|NotebookEdit)           PHASE="coding" ;;
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
    if echo "$CMD" | grep -qiE 'test|pytest|jest|vitest|spec'; then
      PHASE="testing"
    elif echo "$CMD" | grep -qiE 'git diff|git log'; then
      PHASE="reviewing"
    else
      PHASE="coding"
    fi ;;
  Task|TaskCreate|TaskUpdate|TaskList|EnterPlanMode) PHASE="planning" ;;
  AskUserQuestion) PHASE="planning" ;;
  *) PHASE="coding" ;;
esac

# Read existing task or use default
EXISTING_TASK=""
if [ -f "$SIDECAR_FILE" ]; then
  EXISTING_TASK=$(jq -r '.task // ""' "$SIDECAR_FILE" 2>/dev/null)
fi
TASK="${EXISTING_TASK:-Working on project}"

# Infer detail from tool input
DETAIL=$(echo "$INPUT" | jq -r '
  if .tool_input.file_path then "Working on " + (.tool_input.file_path | split("/") | last)
  elif .tool_input.command then "Running: " + (.tool_input.command | .[0:60])
  elif .tool_input.pattern then "Searching: " + (.tool_input.pattern | .[0:40])
  else "Using " + .tool_name
  end')

# Write sidecar (atomic: write tmp then move)
TMPFILE="$SIDECAR_FILE.tmp"
jq -n \
  --arg session_id "$SESSION_ID" \
  --arg cwd "$CWD" \
  --arg task "$TASK" \
  --arg phase "$PHASE" \
  --arg detail "$DETAIL" \
  --arg updated_at "$TIMESTAMP" \
  '{session_id: $session_id, cwd: $cwd, task: $task, phase: $phase, blocked: false, detail: $detail, updated_at: $updated_at}' \
  > "$TMPFILE" && mv "$TMPFILE" "$SIDECAR_FILE"

exit 0
