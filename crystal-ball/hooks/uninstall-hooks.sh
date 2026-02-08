#!/bin/bash
# uninstall-hooks.sh — Remove Crystal Ball hooks from Claude Code settings.
#
# Removes the hooks key from ~/.claude/settings.json and cleans up
# the installed hook script. Does NOT delete session data.

set -euo pipefail

SETTINGS_FILE="$HOME/.claude/settings.json"
HOOK_DEST="$HOME/.crystal-ball/crystal-ball-hook.sh"

# ---------------------------------------------------------------------------
# Step 1: Remove hooks from settings
# ---------------------------------------------------------------------------
if [ -f "$SETTINGS_FILE" ] && command -v jq &>/dev/null; then
  if jq -e '.hooks' "$SETTINGS_FILE" &>/dev/null; then
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
    jq 'del(.hooks)' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "Removed hooks from $SETTINGS_FILE"
    echo "  Backup at $SETTINGS_FILE.bak"
  else
    echo "No hooks found in $SETTINGS_FILE — nothing to remove."
  fi
else
  echo "Settings file not found or jq not available."
fi

# ---------------------------------------------------------------------------
# Step 2: Remove installed hook script
# ---------------------------------------------------------------------------
if [ -f "$HOOK_DEST" ]; then
  rm "$HOOK_DEST"
  echo "Removed $HOOK_DEST"
else
  echo "Hook script not found at $HOOK_DEST — already removed."
fi

echo ""
echo "Crystal Ball hooks uninstalled."
echo "Session data in ~/.crystal-ball/sessions/ was preserved."
echo "To remove session data: rm -rf ~/.crystal-ball/sessions/"
