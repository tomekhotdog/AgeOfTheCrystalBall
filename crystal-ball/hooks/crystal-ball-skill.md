# Crystal Ball - Active Context Protocol

Crystal Ball is a real-time AoE2-style visualization of Claude Code sessions. When a Claude session reports its context via a sidecar file, Crystal Ball can show richer visuals: what task you're working on, what phase you're in, and whether you're blocked.

## How It Works

- **Mode 1** (passive): Crystal Ball infers session state from OS-level metrics (CPU usage, process age). This works automatically with no setup.
- **Mode 2** (active): When a sidecar file exists for your session, Crystal Ball reads it to get richer context. Units show phase-appropriate animations and the selection panel shows task details.

## Sidecar Directory

Sidecar files are stored in a central directory, **not** in your project. This avoids littering project directories with state files.

- **Default location:** `~/.crystal-ball/sessions/`
- **Override:** Set the `CRYSTAL_BALL_DIR` environment variable to use a different directory.
- **File naming:** Each session writes `<session_id>.json` in this directory.

The directory is created automatically by the hook if it doesn't exist.

## Sidecar File Format

```json
{
  "session_id": "abc-123",
  "cwd": "/Users/you/projects/my-app",
  "task": "Implement user authentication",
  "phase": "coding",
  "blocked": false,
  "detail": "Working on login.js",
  "updated_at": "2026-02-06T14:30:00Z"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | No | Your session identifier |
| `cwd` | string | Yes | Working directory (used to match sidecar to discovered process) |
| `task` | string | Yes | Short description of current task |
| `phase` | string | Yes | One of: `planning`, `researching`, `coding`, `testing`, `debugging`, `reviewing`, `documenting`, `idle` |
| `blocked` | boolean | No | Set to `true` when waiting for user input or external dependency |
| `detail` | string | No | Current activity detail (e.g., file being edited) |
| `updated_at` | ISO 8601 | Yes | When this file was last written |

The sidecar file is read every poll cycle (default 2s). Stale files (>10 minutes without update) are deprioritized.

## Installing the Auto-Hook

The Crystal Ball hook automatically writes sidecar files based on tool usage. To install:

1. Copy `hooks/crystal-ball-hook.sh` to a stable location
2. Make it executable: `chmod +x /path/to/crystal-ball-hook.sh`
3. Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "/path/to/crystal-ball-hook.sh"
        }]
      }
    ]
  }
}
```

4. Optionally, set `CRYSTAL_BALL_DIR` in your shell profile if you want a custom location:

```bash
export CRYSTAL_BALL_DIR="$HOME/.crystal-ball/sessions"
```

### What the Hook Does

The hook runs after every tool use and:
- Infers the **phase** from the tool name (e.g., `Read`/`Grep` = researching, `Write`/`Edit` = coding, `Bash` with test commands = testing)
- Preserves the existing **task** field (or defaults to "Working on project")
- Extracts a **detail** string from the tool input (file path, command, search pattern)
- Writes the sidecar atomically (tmp file + mv) to avoid partial reads

### Setting the Task

The hook preserves whatever task is already in the sidecar file. To set a task manually:

```bash
SIDECAR_DIR="${CRYSTAL_BALL_DIR:-$HOME/.crystal-ball/sessions}"
SESSION_FILE="$SIDECAR_DIR/<your-session-id>.json"
jq '.task = "Implement auth system"' "$SESSION_FILE" > "$SESSION_FILE.tmp" && mv "$SESSION_FILE.tmp" "$SESSION_FILE"
```

Or let the hook create the initial file and it will default to "Working on project".

### Setting Blocked

To mark a session as blocked:

```bash
SIDECAR_DIR="${CRYSTAL_BALL_DIR:-$HOME/.crystal-ball/sessions}"
SESSION_FILE="$SIDECAR_DIR/<your-session-id>.json"
jq '.blocked = true | .detail = "Waiting for API key" | .updated_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' \
  "$SESSION_FILE" > "$SESSION_FILE.tmp" && mv "$SESSION_FILE.tmp" "$SESSION_FILE"
```
