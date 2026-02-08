#!/bin/bash
# install-hooks.sh — Install Crystal Ball hooks into Claude Code settings.
#
# What this does:
#   1. Copies crystal-ball-hook.sh to ~/.crystal-ball/crystal-ball-hook.sh
#   2. Creates ~/.crystal-ball/sessions/ directory
#   3. Merges hook configuration into ~/.claude/settings.json
#
# Safe to run multiple times — idempotent.
# Requires: jq

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/crystal-ball-hook.sh"
INSTALL_DIR="$HOME/.crystal-ball"
HOOK_DEST="$INSTALL_DIR/crystal-ball-hook.sh"
SESSIONS_DIR="$INSTALL_DIR/sessions"
SETTINGS_FILE="$HOME/.claude/settings.json"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed."
  echo "  brew install jq"
  exit 1
fi

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "Error: Cannot find $HOOK_SOURCE"
  echo "  Run this script from the crystal-ball/hooks/ directory."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1: Copy hook script
# ---------------------------------------------------------------------------
echo "Installing hook script..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$SESSIONS_DIR"
cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"
echo "  Copied to $HOOK_DEST"

# ---------------------------------------------------------------------------
# Step 2: Build the hooks configuration JSON
# ---------------------------------------------------------------------------
HOOK_CMD="$HOOK_DEST"

HOOKS_CONFIG=$(jq -n --arg cmd "$HOOK_CMD" '{
  "PostToolUse": [
    {
      "matcher": "",
      "hooks": [{"type": "command", "command": $cmd}]
    }
  ],
  "Stop": [
    {
      "hooks": [{"type": "command", "command": $cmd}]
    }
  ],
  "UserPromptSubmit": [
    {
      "hooks": [{"type": "command", "command": $cmd}]
    }
  ],
  "SessionStart": [
    {
      "hooks": [{"type": "command", "command": $cmd}]
    }
  ],
  "SessionEnd": [
    {
      "hooks": [{"type": "command", "command": $cmd}]
    }
  ],
  "Notification": [
    {
      "matcher": "idle_prompt|permission_prompt",
      "hooks": [{"type": "command", "command": $cmd}]
    }
  ]
}')

# ---------------------------------------------------------------------------
# Step 3: Merge into ~/.claude/settings.json
# ---------------------------------------------------------------------------
echo "Configuring Claude Code settings..."
mkdir -p "$HOME/.claude"

if [ -f "$SETTINGS_FILE" ]; then
  # Backup existing settings
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
  echo "  Backed up existing settings to $SETTINGS_FILE.bak"

  # Merge: add/replace hooks key, preserve everything else
  MERGED=$(jq --argjson hooks "$HOOKS_CONFIG" '.hooks = $hooks' "$SETTINGS_FILE")
  echo "$MERGED" > "$SETTINGS_FILE"
else
  # Create new settings file
  jq -n --argjson hooks "$HOOKS_CONFIG" '{hooks: $hooks}' > "$SETTINGS_FILE"
fi

echo "  Updated $SETTINGS_FILE"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "Crystal Ball hooks installed successfully!"
echo ""
echo "  Hook script:  $HOOK_DEST"
echo "  Sidecar dir:  $SESSIONS_DIR"
echo "  Settings:     $SETTINGS_FILE"
echo ""
echo "The hooks will activate on your next Claude Code session."
echo "To verify, start a new session and check:"
echo "  ls $SESSIONS_DIR"
echo ""
echo "To uninstall, run:"
echo "  $SCRIPT_DIR/uninstall-hooks.sh"
