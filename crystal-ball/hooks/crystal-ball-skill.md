# Crystal Ball - Active Context Protocol (Mode 2)

Crystal Ball is a real-time AoE2-style visualization of Claude Code sessions.
When a Claude session reports its context via a sidecar file, Crystal Ball
shows richer visuals: what task you're working on, what phase you're in, and
whether you're blocked waiting for user input.

## Modes

- **Mode 1** (passive): Crystal Ball infers session state from OS-level
  metrics (CPU usage, process age). Works automatically with no setup.
- **Mode 2** (active): A Claude Code hook writes a sidecar file after every
  tool use and lifecycle event. Crystal Ball reads it to show phase-appropriate
  animations, task details, and blocked/active state.

## Quick Install

```bash
cd crystal-ball/hooks
./install-hooks.sh
```

This copies the hook to `~/.crystal-ball/`, creates the sessions directory,
and merges the configuration into `~/.claude/settings.json`. Safe to run
multiple times.

To uninstall:

```bash
./uninstall-hooks.sh
```

## Hook Events

The hook handles six Claude Code lifecycle events:

| Event | When | What the hook does |
|---|---|---|
| `SessionStart` | New session begins | Creates a fresh sidecar (`blocked: false`) |
| `PostToolUse` | After every tool call | Infers phase from tool, updates detail, sets `blocked: false` |
| `Stop` | Claude finishes responding | Sets `blocked: true` (waiting for user) |
| `UserPromptSubmit` | User types a message | Sets `blocked: false`, captures prompt preview |
| `Notification` | Permission/idle prompt | Reinforces `blocked: true` |
| `SessionEnd` | Session terminates | Deletes the sidecar file (cleanup) |

### Phase Inference (PostToolUse)

The hook infers the current work phase from the tool name:

| Tools | Phase |
|---|---|
| `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch` | `researching` |
| `Write`, `Edit`, `NotebookEdit` | `coding` |
| `Bash` (test commands) | `testing` |
| `Bash` (git commands) | `reviewing` |
| `Bash` (other) | `coding` |
| `Task*`, `EnterPlanMode`, `AskUserQuestion` | `planning` |

### Blocked Detection

The key insight: **`Stop` = Claude finished, waiting for user**. The hook
sets `blocked: true` on Stop and `blocked: false` on PostToolUse and
UserPromptSubmit. This gives accurate real-time detection of whether a
session needs attention.

Flow:
```
Claude working (tools firing)  →  blocked: false
Claude stops responding        →  blocked: true
User submits new prompt        →  blocked: false
Claude starts using tools      →  blocked: false (reinforced)
```

## Sidecar Directory

Sidecar files are stored centrally, not in project directories.

- **Default:** `~/.crystal-ball/sessions/`
- **Override:** Set `CRYSTAL_BALL_DIR` environment variable
- **Naming:** `<session_id>.json`
- **Cleanup:** Files are deleted on `SessionEnd`

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

| Field | Type | Description |
|---|---|---|
| `session_id` | string | Claude Code session UUID |
| `cwd` | string | Working directory (used to match to OS process) |
| `task` | string | Current task description |
| `phase` | string | One of: `planning`, `researching`, `coding`, `testing`, `debugging`, `reviewing`, `documenting`, `idle` |
| `blocked` | boolean | `true` when waiting for user input |
| `detail` | string | Current activity (file, command, search) |
| `updated_at` | ISO 8601 | Last update timestamp |

Sidecar files are read every poll cycle (default 2s). Files older than 10
minutes without update are marked stale and deprioritized.

## Manual Overrides

### Setting the task

The hook preserves whatever task is already in the sidecar. To set it:

```bash
SIDECAR_DIR="${CRYSTAL_BALL_DIR:-$HOME/.crystal-ball/sessions}"
# Find your session file
ls "$SIDECAR_DIR"
# Update the task
jq '.task = "Build auth system"' "$SIDECAR_DIR/<session-id>.json" > /tmp/cb.json && mv /tmp/cb.json "$SIDECAR_DIR/<session-id>.json"
```

### Forcing blocked state

```bash
jq '.blocked = true | .detail = "Waiting for API key"' "$SIDECAR_DIR/<session-id>.json" > /tmp/cb.json && mv /tmp/cb.json "$SIDECAR_DIR/<session-id>.json"
```

## How the Server Uses Sidecar Data

1. Server reads all `.json` files from the sidecar directory
2. Matches each file to a discovered OS process by `cwd`
3. Validates schema (task, phase, updated_at required)
4. Merges with OS-level classification:
   - `blocked: true` in sidecar **always overrides** OS state
   - Stale sidecar + idle OS process → OS state wins
   - Fresh sidecar + any OS state → sidecar enriches
5. Sets `mode: 2` and attaches `context` object to session

## How the Client Renders Mode 2

- **Unit animations**: Phase maps to activity (coding → Building, researching → Patrolling, etc.)
- **Blocked state**: Muted blue-grey body, pause icon, 0.4x animation speed
- **Selection panel**: Shows task, phase badge, detail text, blocked indicator
- **War Room**: Mode 2 Intel section with phase distribution and blocked list
- **HUD**: Blocked session counter with alert styling

## Requirements

- `jq` (JSON processor): `brew install jq`
- Claude Code with hooks support
- Crystal Ball server running with real discovery (not simulator)
