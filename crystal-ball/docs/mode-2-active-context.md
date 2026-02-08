# Mode 2: Active Context Protocol

## Overview

Crystal Ball operates in two modes for understanding what each Claude Code
session is doing:

**Mode 1 (Passive)** — The server discovers Claude processes via the OS
(process list, CPU usage, working directory) and classifies them as active,
awaiting, idle, or stale based on CPU patterns. No setup required. Limited
visibility: the server knows *that* a session exists and roughly how busy it
is, but not *what* it's working on.

**Mode 2 (Active)** — A lightweight Claude Code hook writes a JSON sidecar
file after every tool use and lifecycle event. The Crystal Ball server reads
these files and merges them with OS-level data, giving each session rich
context: the current task, work phase, activity detail, and whether the
session is blocked waiting for user input. This transforms units from
generic villagers into contextual representations of real work.

## What Mode 2 Adds

| Feature | Mode 1 | Mode 2 |
|---|---|---|
| Session detection | OS process list | OS + sidecar file |
| State classification | CPU-based (active/idle/stale) | CPU + explicit blocked flag |
| Current task | Not available | "Implement auth system" |
| Work phase | Not available | planning/coding/testing/etc. |
| Activity detail | Not available | "Working on login.js" |
| Blocked detection | Not available | Real-time (Stop event) |
| Unit animations | Group-based (random per building) | Phase-driven (coding=Building, researching=Patrolling) |
| Selection panel | Basic: name, state, uptime | Rich: task, phase badge, detail, blocked indicator |
| War Room intel | Session counts only | Phase distribution bar, blocked session list |

## Architecture

```
Claude Code Session
      │
      ├── SessionStart ──────────────┐
      ├── UserPromptSubmit ──────────┤
      ├── PostToolUse (repeated) ────┤
      ├── Notification ──────────────┤  crystal-ball-hook.sh
      ├── Stop ──────────────────────┤  (reads stdin JSON,
      └── SessionEnd ────────────────┘   writes sidecar file)
                                            │
                                            ▼
                               ~/.crystal-ball/sessions/
                               ├── <session-1>.json
                               ├── <session-2>.json
                               └── <session-3>.json
                                            │
                                            ▼
                               Crystal Ball Server
                               (polls every 2s)
                                            │
                        ┌───────────────────┼───────────────────┐
                        ▼                   ▼                   ▼
                   OS Discovery        Sidecar Reader      Session Store
                   (ps, CPU usage)     (readAllSidecars)   (merge + classify)
                                                                │
                                                                ▼
                                                          /api/sessions
                                                                │
                        ┌───────────────────┼───────────────────┐
                        ▼                   ▼                   ▼
                   World Manager       Selection Panel      War Room
                   (unit visuals)      (detail display)     (intel view)
```

## Hook Events

The Crystal Ball hook (`crystal-ball-hook.sh`) is a single bash script that
handles six Claude Code lifecycle events. It reads the event type from the
`hook_event_name` field in the stdin JSON and branches accordingly.

### SessionStart

**When:** A new Claude Code session begins or resumes.

**Action:** Creates a fresh sidecar file with `blocked: false`, phase
`planning`, and task "Working on project".

**Why:** Ensures the sidecar exists from the very start of a session, before
any tools have fired.

### PostToolUse

**When:** After every successful tool call (Read, Write, Bash, Grep, etc.).

**Action:**
- Sets `blocked: false` (Claude is actively working)
- Infers the work phase from the tool name
- Extracts an activity detail from the tool input
- Preserves the existing task field

**Phase inference rules:**

| Tool | Phase |
|---|---|
| Read, Grep, Glob, WebSearch, WebFetch | `researching` |
| Write, Edit, NotebookEdit | `coding` |
| Bash with test/jest/pytest/vitest/spec | `testing` |
| Bash with git diff/log/show | `reviewing` |
| Bash with git commit/push/add | `reviewing` |
| Bash (other) | `coding` |
| Task, TaskCreate, TaskUpdate, TaskList | `planning` |
| EnterPlanMode, ExitPlanMode, AskUserQuestion | `planning` |
| Any other tool | `coding` |

**Detail extraction:**
- File tools: "Working on `<filename>`"
- Bash: "Running: `<first 60 chars of command>`"
- Search: "Searching: `<pattern>`"
- Web: "Searching: `<query>`"
- Agents: "Agent: `<first 40 chars of prompt>`"

### Stop

**When:** Claude finishes generating a response. This is the moment when the
session transitions from "Claude is working" to "waiting for user input".

**Action:** Sets `blocked: true` and detail "Waiting for user input".
Preserves the existing task and phase.

**Why this works:** The Stop event fires exactly when Claude stops and waits.
Combined with PostToolUse (which fires when Claude starts working again),
this gives accurate real-time blocked detection without any polling delay.

### UserPromptSubmit

**When:** The user types a message and presses Enter.

**Action:** Sets `blocked: false`, phase `planning`, and captures the first
50 characters of the prompt as a detail preview.

**Why:** The user has responded, so the session is no longer blocked. Phase
resets to `planning` because Claude typically reads/thinks before acting.

### Notification

**When:** Claude Code shows a notification. Matched to `idle_prompt`
(session idle for 60+ seconds) and `permission_prompt` (permission dialog).

**Action:** Reinforces `blocked: true`. This catches cases where the Stop
event might not have fired or the sidecar was stale.

### SessionEnd

**When:** The Claude Code session terminates (user exits, clears, etc.).

**Action:** Deletes the sidecar file and its temp file. This prevents
orphaned sidecars from appearing as phantom sessions.

## Sidecar File Format

Each session writes a single JSON file to `~/.crystal-ball/sessions/`:

```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "cwd": "/Users/tomasz/projects/my-app",
  "task": "Implement user authentication",
  "phase": "coding",
  "blocked": false,
  "detail": "Working on login.js",
  "updated_at": "2026-02-07T14:30:00Z"
}
```

### Field Reference

**session_id** (string) — Claude Code's UUID for the session. Used as the
filename. Note: changes if the session is resumed with `--resume`.

**cwd** (string) — The working directory. This is the key used to match
sidecar files to OS-discovered processes.

**task** (string) — A short description of what the session is working on.
The hook preserves this field across updates; it defaults to "Working on
project" and can be manually overridden.

**phase** (string) — The current work phase. One of: `planning`,
`researching`, `coding`, `testing`, `debugging`, `reviewing`, `documenting`,
`idle`. Inferred from the most recent tool use.

**blocked** (boolean) — Whether the session is waiting for user input. Set
to `true` by Stop and Notification events, `false` by PostToolUse and
UserPromptSubmit.

**detail** (string) — A human-readable description of the current activity.
Examples: "Working on auth.js", "Running: npm test", "Searching: login flow",
"Waiting for user input".

**updated_at** (ISO 8601) — When the sidecar was last written. Used for
stale detection (files >10 minutes old are deprioritized).

### Atomicity

The hook writes to a `.tmp` file first, then atomically renames it to the
final path. This prevents the server from reading a partially-written file.

## Server-Side Processing

### Discovery + Sidecar Merge

Every poll cycle (default 2 seconds), the Crystal Ball server:

1. **Discovers processes** via OS-level tools (ps, /proc, etc.)
2. **Reads all sidecar files** from `~/.crystal-ball/sessions/`
3. **Matches** sidecars to processes by working directory (`cwd`)
4. **Validates** each sidecar (requires task, valid phase, valid timestamp)
5. **Resolves state** using both OS classification and sidecar context

### State Resolution

The `resolveState()` function in `sessionStore.js` determines the final
session state:

```
if no sidecar exists          →  use OS state (Mode 1)
if sidecar.blocked === true   →  state = "blocked" (always wins)
if sidecar is stale AND
   OS says idle/stale         →  use OS state (sidecar too old)
otherwise                     →  use OS state, enriched with context
```

The `blocked` flag is treated as explicit user intent and always overrides
the OS-level classification. This means even if CPU shows the process as
active (e.g. a background task), blocked=true from the hook will show the
unit as waiting.

### API Response

Sessions are returned to the client with mode and context:

```json
{
  "id": "claude-101",
  "pid": 101,
  "cwd": "/projects/alpha",
  "state": "blocked",
  "mode": 2,
  "context": {
    "task": "Build auth system",
    "phase": "coding",
    "blocked": true,
    "detail": "Waiting for user input",
    "stale": false
  }
}
```

Mode 1 sessions have `"mode": 1` and `"context": null`.

## Client-Side Rendering

### Phase-Driven Animations

When a session has Mode 2 context, the client uses the phase to select
unit animations instead of the default group-based assignment:

| Phase | Activity |
|---|---|
| `planning` | Scribing (writing on parchment) |
| `researching` | Patrolling (exploring the map) |
| `coding` | Building (hammer and construction) |
| `testing` | Mining (digging for bugs) |
| `debugging` | Mining (deeper digging) |
| `reviewing` | Patrolling (reviewing the territory) |
| `documenting` | Scribing (writing documentation) |
| `idle` | Resting (standing still) |

### Blocked State Visuals

When a session is blocked (waiting for user input):

- **Body colour**: Muted blue-grey (#8899AA) — subdued, not alarming
- **Opacity**: 0.85 — slightly translucent
- **Label**: Small pause icon (⏸) floating above the unit
- **Animation speed**: 0.4x — slow but not frozen
- **Design rationale**: Since most sessions will be blocked most of the
  time, the blocked state is designed as the calm default. Active sessions
  naturally stand out as the interesting ones.

### Selection Panel

Clicking a Mode 2 unit shows:

- Mode badge ("Mode 2")
- Task name
- Phase badge with colour coding
- Activity detail
- Blocked indicator (if blocked)

### War Room / Trading Floor

The War Room's Mode 2 Intel section shows:

- Phase distribution bar (how many sessions in each phase)
- List of blocked sessions with their detail text
- Activity score (blocked sessions score 0, like idle)

### HUD

The top-left HUD shows a blocked session counter with alert styling,
integrated alongside active/awaiting/idle/stale counts.

## Installation

### Prerequisites

- **jq**: `brew install jq`
- **Claude Code** with hooks support (v1.0+)
- **Crystal Ball server** running

### Automatic Install

```bash
cd crystal-ball/hooks
./install-hooks.sh
```

This:
1. Copies `crystal-ball-hook.sh` to `~/.crystal-ball/crystal-ball-hook.sh`
2. Creates `~/.crystal-ball/sessions/` directory
3. Merges hook config into `~/.claude/settings.json` (backs up existing)

### Manual Install

1. Copy the hook script:
   ```bash
   mkdir -p ~/.crystal-ball/sessions
   cp hooks/crystal-ball-hook.sh ~/.crystal-ball/crystal-ball-hook.sh
   chmod +x ~/.crystal-ball/crystal-ball-hook.sh
   ```

2. Add to `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PostToolUse": [
         {"matcher": "", "hooks": [{"type": "command", "command": "~/.crystal-ball/crystal-ball-hook.sh"}]}
       ],
       "Stop": [
         {"hooks": [{"type": "command", "command": "~/.crystal-ball/crystal-ball-hook.sh"}]}
       ],
       "UserPromptSubmit": [
         {"hooks": [{"type": "command", "command": "~/.crystal-ball/crystal-ball-hook.sh"}]}
       ],
       "SessionStart": [
         {"hooks": [{"type": "command", "command": "~/.crystal-ball/crystal-ball-hook.sh"}]}
       ],
       "SessionEnd": [
         {"hooks": [{"type": "command", "command": "~/.crystal-ball/crystal-ball-hook.sh"}]}
       ],
       "Notification": [
         {"matcher": "idle_prompt|permission_prompt", "hooks": [{"type": "command", "command": "~/.crystal-ball/crystal-ball-hook.sh"}]}
       ]
     }
   }
   ```

3. Restart Claude Code (hooks are snapshotted at session startup).

### Verify

After installing and starting a new Claude Code session:

```bash
ls ~/.crystal-ball/sessions/
# Should show a .json file for your active session

cat ~/.crystal-ball/sessions/*.json | jq .
# Should show sidecar data with task, phase, blocked fields
```

### Uninstall

```bash
cd crystal-ball/hooks
./uninstall-hooks.sh
```

Or manually remove the `hooks` key from `~/.claude/settings.json`.

## Troubleshooting

**No sidecar files appearing:**
- Check that jq is installed: `which jq`
- Verify hooks are configured: `cat ~/.claude/settings.json | jq .hooks`
- Hooks activate on NEW sessions — restart Claude Code after installing
- Check the hook is executable: `ls -la ~/.crystal-ball/crystal-ball-hook.sh`

**Session shows Mode 1 instead of Mode 2:**
- The server matches sidecars by `cwd`. Make sure the Claude session's
  working directory matches what the hook writes.
- Check if the sidecar file exists and has valid JSON:
  `cat ~/.crystal-ball/sessions/*.json | jq .`

**Blocked state not showing:**
- Blocked is only set on the `Stop` event. If Claude is still generating,
  the session shows as active.
- Check the sidecar: `jq .blocked ~/.crystal-ball/sessions/*.json`

**Stale sessions persisting:**
- Sidecar files are cleaned up on `SessionEnd`. If a session crashes or
  is force-killed, the file may remain.
- Manual cleanup: `rm ~/.crystal-ball/sessions/<session-id>.json`

**Custom sidecar directory:**
```bash
export CRYSTAL_BALL_DIR="/custom/path/sessions"
```
Set this in your shell profile and restart both Claude Code and Crystal Ball.

## Known Limitations

- **Session ID instability**: If a session is resumed with `--resume` or
  `--continue`, Claude assigns a new UUID. The old sidecar file will be
  orphaned until it goes stale (10 minutes). The SessionEnd event for the
  new session cleans up the new file, not the old one.

- **Stop event semantics**: The Stop event fires every time Claude finishes
  a response, not just when it asks a question. This means brief moments
  between multi-turn tool use may briefly show as "blocked". In practice
  this is invisible because PostToolUse fires almost immediately after.

- **Task persistence**: The hook preserves the task field but never updates
  it automatically. Users must manually set the task via jq if they want
  a descriptive task name beyond "Working on project".

- **No history**: Only the current state is stored. Phase transitions and
  activity timeline are not persisted. The War Room shows a snapshot, not
  a history.
