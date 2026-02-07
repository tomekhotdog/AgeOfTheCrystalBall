# G-Research: Age of the Crystal Ball — V1 Addendum

## Multi-Person View & Active Context Hooks

**Prerequisite:** This spec extends the V0 MVP defined in `CRYSTAL-BALL-SPEC.md`. V0 must be working (simulation mode at minimum) before implementing anything here. All V0 behaviour is preserved — nothing in this addendum removes or replaces existing functionality.

**Two features, one dependency chain:**

1. **Mode 2: Active Context Hooks** — Claude sessions optionally write richer context that the daemon reads and incorporates into the visualisation
2. **Multi-Person View** — multiple users share their session state via a central relay server, producing a combined map

Mode 2 should be built first. Multi-person depends on Mode 2 being designed (though not required for each user) because the data contract needs to accommodate richer payloads from the start.

---

## Part 1: Context Modes

The system supports two explicit context modes. Every session is always in exactly one mode, and the mode is determined automatically based on whether a sidecar file exists.

### Mode 1: Passive (OS-Level Inference) — Default

This is V0 behaviour, unchanged. The daemon reads process stats from the OS and infers state heuristically. No configuration required on the Claude side. Every session starts here and stays here unless a sidecar file is detected.

**Data available:** PID, cwd, CPU, memory, age, TTY, has_children, inferred state (active/awaiting/idle/stale).

**Visualisation:** Generic villager with random accessory, activity assigned by gathering-point, state-driven animation modifiers. Selection panel shows OS-level stats only.

### Mode 2: Active (Hook-Reported Context)

Claude sessions write a structured sidecar file that the daemon reads. The file provides task-level context that dramatically improves visualisation fidelity.

**Data available:** Everything from Mode 1, plus: task summary, phase, blocked status, freeform detail.

**Visualisation:** Villager activity is driven by `phase` (not random assignment). Selection panel shows rich task context. Blocked sessions get a distinct urgent visual treatment. Phase-specific animations replace generic ones.

### Mode Detection

The daemon determines mode per-session by checking for the sidecar file:

```
For each discovered session:
  1. Read OS-level stats (always — this is Mode 1 baseline)
  2. Check if {cwd}/.crystal-ball.json exists
     - Yes → read it, validate schema, merge with OS data → Mode 2
     - No  → Mode 1 only
  3. If sidecar exists but is older than 10 minutes:
     - Include sidecar data but flag as potentially stale
     - OS-level state takes precedence over sidecar phase
       (e.g. sidecar says "coding" but CPU is 0 for 15 min → show as "idle", not "coding")
```

This means Mode 1 and Mode 2 sessions coexist naturally. On the shared map, some villagers are generic (Mode 1) and some are richly annotated (Mode 2). No configuration needed — the presence of the file is the signal.

---

## Part 2: Active Context Hook — Sidecar Protocol

### 2.1 File Specification

**Filename:** `.crystal-ball.json`
**Location:** Root of the Claude session's working directory (`cwd`)
**Written by:** Claude Code (via a skill, hook, or manual tool use)
**Read by:** The Crystal Ball daemon (during its normal polling cycle)

### 2.2 Schema

```json
{
  "session_id": "claude-48231",
  "task": "Refactoring auth middleware for OAuth2 support",
  "phase": "coding",
  "blocked": false,
  "detail": "Working on token refresh logic in middleware.ts",
  "updated_at": "2025-02-07T14:23:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | No | Optional self-identification. If absent, daemon matches by cwd. |
| `task` | string | **Yes** | One-line summary of the current objective. Max 120 chars. |
| `phase` | enum | **Yes** | Current work phase (see vocabulary below). |
| `blocked` | boolean | No | Default `false`. When `true`, triggers urgent visual treatment. |
| `detail` | string | No | Freeform line for extra context. Max 200 chars. Shown in selection panel only. |
| `updated_at` | ISO 8601 | **Yes** | When this file was last written. Used for staleness detection. |

### 2.3 Phase Vocabulary

Fixed set of 8 phases. Each maps to a specific villager activity and animation:

| Phase | Meaning | Villager Activity | Animation |
|-------|---------|-------------------|-----------|
| `planning` | Thinking about approach, reading requirements | Studying a blueprint/map | Standing still, looking at floating plan object, slow head movement |
| `researching` | Reading docs, exploring codebases, searching | Scholar in library | Seated/scribing animation, page-turn motion |
| `coding` | Actively writing or editing code | Building/constructing | Energetic hammering motion, structure growing nearby |
| `testing` | Running tests, validating behaviour | Inspecting/measuring | Unit crouching, examining object, periodic stand-up-and-look |
| `debugging` | Hunting for a bug, investigating failures | Mining/digging | Pickaxe animation, digging into rock face |
| `reviewing` | Reading diffs, checking work quality | Patrolling/surveying | Slow walk around the building perimeter, looking around |
| `documenting` | Writing docs, comments, READMEs | Scribing at desk | Seated writing animation, scroll growing |
| `idle` | Session is quiet, no active task | Resting | Campfire rest or slow idle bob |

When a gathering point has Mode 2 sessions, the building's activity is determined by the **majority phase** of its active sessions, rather than random assignment. If 3 of 4 sessions are in `coding`, the gathering point visually emphasises construction. If there's no majority, fall back to the most energetic phase present.

Mode 1 sessions at the same gathering point use the gathering point's determined activity — they blend in with the Mode 2 sessions rather than doing something random.

### 2.4 Blocked State — The Red Alert

When `blocked: true`, the session gets special treatment that overrides normal state visuals:

- **Unit visual:** Red pulsing glow (distinct from the gold "awaiting" pulse). A floating "⛔" or "!" marker above the unit, larger and more urgent than the awaiting indicator.
- **Selection panel:** Shows the `detail` field prominently — this is where Claude explains what it's stuck on.
- **HUD:** A separate "Blocked" counter appears in the top bar, pulsing red when > 0.
- **Gathering point:** If any unit in a group is blocked, the building gets a subtle red tint to its label background.

`blocked` is the highest-priority visual signal in the system. It means "a Claude needs human intervention." In AoE terms, it's your villager being attacked — you need to respond.

### 2.5 Writing Frequency

The sidecar file should be written:

1. **Once at task start** — when Claude begins a new piece of work
2. **On phase change** — when the nature of the work shifts (e.g. coding → testing)
3. **On blocked status change** — immediately when blocked, immediately when unblocked
4. **Periodic refresh** — every 5 minutes during sustained work (to keep `updated_at` fresh)
5. **On task completion** — either delete the file or write `{ "phase": "idle", "task": "Completed: [summary]" }`

### 2.6 Claude Code Hook Implementation

The hook can be implemented as a Claude Code skill, a shell wrapper, or a project-level instruction. Here's the recommended approach — a lightweight SKILL.md that Claude Code can be instructed to follow:

**File: `crystal-ball-hook/SKILL.md`**

```markdown
# Crystal Ball Status Hook

When working on tasks, maintain a `.crystal-ball.json` file in the project
root to report your status to the Crystal Ball monitoring system.

## When to update

- At the start of each new task
- When your work phase changes (e.g. from coding to testing)
- When you become blocked on something requiring human input
- Every ~5 minutes during long sustained work
- When you complete a task

## File format

Write to `.crystal-ball.json` in the current working directory:

{
  "task": "Brief one-line summary of current objective",
  "phase": "coding",
  "blocked": false,
  "detail": "Optional extra context about what you're doing right now",
  "updated_at": "2025-02-07T14:23:00Z"
}

## Phase values (use exactly one)

planning, researching, coding, testing, debugging, reviewing, documenting, idle

## Rules

- Keep `task` under 120 characters
- Keep `detail` under 200 characters
- Set `blocked: true` only when you genuinely need human input to proceed
- When setting blocked, explain what you need in `detail`
- Use ISO 8601 for updated_at (new Date().toISOString() format)
- On task completion, set phase to "idle" and update task to "Completed: [summary]"
```

This skill can be included in a project's `.claude/` configuration or passed as a session instruction. The key design decision: **the hook is opt-in per project, not globally enforced.** Users add it to projects where they want richer monitoring.

### 2.7 Staleness and Conflict Resolution

The daemon must handle edge cases where Mode 1 (OS) and Mode 2 (sidecar) data disagree:

| Scenario | Resolution |
|----------|-----------|
| Sidecar says `coding`, OS shows high CPU | Agree — show as active, coding phase |
| Sidecar says `coding`, OS shows zero CPU for 15 min | Disagree — OS wins. Show as idle, but display stale sidecar task in selection panel with "(stale)" label |
| Sidecar says `blocked`, OS shows active CPU | Trust sidecar — blocked overrides OS state. Claude might be spinning/retrying while blocked |
| Sidecar `updated_at` > 10 minutes old | Flag as stale. Show sidecar data in panel but dimmed. Use OS state for visualisation |
| Sidecar file is malformed/invalid JSON | Ignore entirely, fall back to Mode 1. Log a warning. |
| Multiple Claude sessions in same cwd, one sidecar file | All sessions in that cwd share the same sidecar data. This is fine — they're working on the same project. |

---

## Part 3: Multi-Person Architecture

### 3.1 Network Topology

```
[ User A's machine ]              [ User B's machine ]
  Local daemon                      Local daemon
  ├── Process discovery             ├── Process discovery
  ├── Sidecar reading               ├── Sidecar reading
  ├── Local browser view            ├── Local browser view
  └── Relay client ──────┐    ┌──── Relay client
                          │    │
                          v    v
                  [ Central Relay Server ]
                    ├── Receives snapshots
                    ├── Stores in memory (ephemeral)
                    ├── Serves combined state
                    └── Notifies connected clients
                          │    │
                          v    v
              [ Any browser viewing combined map ]
```

The central relay server is a separate, lightweight Node.js process. It can run on any shared machine — a team server, a cloud instance, or even one person's laptop if others can reach it. For V1, it's a single-process in-memory server with no persistence, no database, no auth beyond simple tokens.

### 3.2 Local Daemon Changes

The local daemon gains two new responsibilities:

1. **Publish:** Periodically push its session snapshot to the central relay (if configured)
2. **Subscribe:** Fetch the combined view from the central relay (for the browser to display)

**Configuration** (via CLI flags or environment variables):

| Config | Default | Description |
|--------|---------|-------------|
| `--relay-url` | none | URL of the central relay server. If unset, multi-person is disabled. |
| `--user-name` | OS username | Display name for this user on the shared map |
| `--user-color` | auto-assigned | Player colour for this user's units (hex colour) |
| `--share` | `false` | Whether to publish sessions to the relay. Must be explicitly enabled. |
| `--include-users` | `*` | Comma-separated list of usernames to include in combined view. `*` = everyone. |

**Publish cycle:** Every poll interval (2 seconds), if `--share` is enabled, POST the full session snapshot to the relay:

```
POST /api/publish
{
  "user": "tomek",
  "user_color": "#e8843a",
  "timestamp": 1738800000,
  "sessions": [ ... ],
  "groups": [ ... ]
}
```

**Subscribe cycle:** Every poll interval, GET the combined view from the relay:

```
GET /api/combined?include=tomek,sarah,alex
→ returns merged session/group data from requested users
```

### 3.3 Central Relay Server

A minimal Node.js + Express server. Its entire job is:

1. Accept session snapshots from local daemons via POST
2. Store the latest snapshot per user in memory
3. Serve combined/filtered views via GET
4. Expire snapshots that haven't been updated in 30 seconds (user went offline)

**Full API:**

#### `POST /api/publish`

Receives a user's session snapshot. Overwrites any previous snapshot for that user.

Request body:
```json
{
  "user": "tomek",
  "user_color": "#e8843a",
  "token": "simple-shared-secret",
  "timestamp": 1738800000,
  "sessions": [
    {
      "id": "claude-48231",
      "pid": 48231,
      "cwd": "/home/tomek/projects/isaval-erp",
      "cpu": 43.2,
      "mem": 187.4,
      "state": "active",
      "age_seconds": 1247,
      "tty": "/dev/pts/3",
      "has_children": true,
      "group": "isaval-erp",
      "mode": 2,
      "context": {
        "task": "Refactoring auth middleware",
        "phase": "coding",
        "blocked": false,
        "detail": "Token refresh logic",
        "updated_at": "2025-02-07T14:23:00Z"
      }
    }
  ],
  "groups": [
    {
      "id": "isaval-erp",
      "cwd": "/home/tomek/projects/isaval-erp",
      "session_count": 4,
      "session_ids": ["claude-48231", "claude-48290"]
    }
  ]
}
```

Response: `200 OK` with `{ "status": "ok", "users_online": 3 }`

#### `GET /api/combined`

Returns merged state from all (or filtered) users.

Query parameters:
| Param | Description |
|-------|-------------|
| `include` | Comma-separated usernames. If omitted, returns all. |
| `exclude` | Comma-separated usernames to exclude. |

Response:
```json
{
  "timestamp": 1738800000,
  "users": [
    {
      "name": "tomek",
      "color": "#e8843a",
      "online": true,
      "last_seen": 1738800000,
      "session_count": 4
    },
    {
      "name": "sarah",
      "color": "#7eb8da",
      "online": true,
      "last_seen": 1738799998,
      "session_count": 3
    }
  ],
  "sessions": [
    {
      "id": "tomek/claude-48231",
      "user": "tomek",
      "user_color": "#e8843a",
      "pid": 48231,
      "cwd": "/home/tomek/projects/isaval-erp",
      "cpu": 43.2,
      "state": "active",
      "age_seconds": 1247,
      "has_children": true,
      "group": "isaval-erp",
      "mode": 2,
      "context": {
        "task": "Refactoring auth middleware",
        "phase": "coding",
        "blocked": false,
        "detail": "Token refresh logic"
      }
    },
    {
      "id": "sarah/claude-51002",
      "user": "sarah",
      "user_color": "#7eb8da",
      "pid": 51002,
      "cwd": "/home/sarah/projects/isaval-erp",
      "cpu": 12.1,
      "state": "active",
      "age_seconds": 890,
      "has_children": false,
      "group": "isaval-erp",
      "mode": 1,
      "context": null
    }
  ],
  "groups": [
    {
      "id": "isaval-erp",
      "session_count": 5,
      "users": ["tomek", "sarah"],
      "session_ids": ["tomek/claude-48231", "tomek/claude-48290", "sarah/claude-51002", "sarah/claude-51003", "sarah/claude-51120"]
    }
  ]
}
```

Note: session IDs in the combined view are namespaced as `{user}/{local_id}` to avoid collisions. Groups are merged by directory basename — if Tomek and Sarah both have sessions in directories ending with `isaval-erp`, those are the same group regardless of the full path (which will differ between machines).

#### `GET /api/users`

Returns list of currently online users.

```json
{
  "users": [
    { "name": "tomek", "color": "#e8843a", "online": true, "session_count": 4, "last_seen": 1738800000 },
    { "name": "sarah", "color": "#7eb8da", "online": true, "session_count": 3, "last_seen": 1738799998 }
  ]
}
```

### 3.4 Authentication — Minimal for V1

Full auth is deferred. For V1, use a simple shared token:

- The relay server is started with `--token=<secret>`
- All publish requests include this token in the body
- The combined/users endpoints are unauthenticated (read-only is less sensitive)
- This is sufficient for a team on a private network

### 3.5 Group Merging Logic

The most important piece of multi-person logic. When sessions from different users share the same project, they must appear at the same gathering point.

**Merge key:** The group ID is the basename of the working directory (e.g. `isaval-erp`). This is already defined in V0. In multi-person mode, the relay server merges groups across users using this key.

**Conflict handling:**

| Scenario | Resolution |
|----------|-----------|
| Same basename, genuinely same project | Correct merge — units cluster together |
| Same basename, different projects (e.g. both have a dir called `utils`) | False merge — units cluster incorrectly. Acceptable for V1. V2 could use a project identifier in the sidecar file. |
| Same project, different basename (e.g. `isaval-erp` vs `isaval-erp-fork`) | No merge — separate buildings. Acceptable. |

For V1, simple basename matching is good enough. Document the false-merge risk and move on.

### 3.6 Browser Changes for Multi-Person

The frontend needs these additions when viewing combined data:

**Player colours on units:** Each user's units are tinted with their player colour. Implementation: adjust the unit body material's colour by blending the base colour with the user's colour. The effect should be visible but not garish — think a subtle tint or a coloured sash/banner on the unit, not a fully recoloured character.

Alternatively (and probably better visually): each unit gets a small coloured banner or flag — a tiny plane mesh hovering behind or above the unit in the player's colour. This is the AoE approach and it's immediately readable.

**Player roster panel:** A new panel (collapsible, probably top-right or left sidebar) showing:

```
┌─────────────────────────────┐
│  👥 Online (3)              │
│                             │
│  ● Tomek        4 sessions  │
│    ██ #e8843a               │
│  ● Sarah        3 sessions  │
│    ██ #7eb8da               │
│  ● Alex         2 sessions  │
│    ██ #6ecf94               │
│                             │
│  [Filter: All ▾]            │
└─────────────────────────────┘
```

Clicking a user name filters the view to show only their sessions. Clicking again removes the filter.

**Building labels updated:** Building labels now show which users have sessions there:

```
isaval-erp (5)
Tomek ●● Sarah ●●●
```

Small coloured dots indicating how many sessions each user has at that gathering point.

**Selection panel updated:** When selecting a unit in combined mode, the panel includes the user's name and colour:

```
┌──────────────────────────────────────────────┐
│  📜 claude-48231               Tomek  [●]    │
│                                [active]       │
│                                               │
│  Task:       Refactoring auth middleware      │
│  Phase:      coding                           │
│  Project:    isaval-erp                       │
│  CPU:        43.2%  ████████░░  MEM: 187 MB   │
│  Uptime:     20m 47s                          │
│  Mode:       Active (hook reporting)          │
│                                               │
│  Detail:     Token refresh logic              │
└──────────────────────────────────────────────┘
```

**Group selection in combined mode** shows all users' sessions:

```
┌──────────────────────────────────────────────┐
│  🏗️ isaval-erp                   [5 units]    │
│  Contributors: Tomek (2), Sarah (3)           │
│                                               │
│  Active: 3  │  Awaiting: 1  │  Blocked: 1    │
│                                               │
│  ● tomek/claude-48231    coding     CPU 43%   │
│  ● tomek/claude-48290    testing    CPU 67%   │
│  ● sarah/claude-51002    coding     CPU 12%   │
│  ◐ sarah/claude-51003    awaiting   CPU  1%   │
│  ⛔ sarah/claude-51120   BLOCKED    CPU  0%   │
│     "Needs API credentials for staging env"   │
└──────────────────────────────────────────────┘
```

### 3.7 HUD Updates for Multi-Person

The top bar expands to show multi-person aggregate data:

```
Age of the Crystal Ball │ Users: 3 │ Sessions: 9 │ Active: 5 │ Awaiting: 2 │ Blocked: 1 │ Idle: 1
```

The "Blocked" counter is new (from Mode 2) and pulses red when > 0. "Awaiting" continues to pulse gold.

---

## Part 4: Data Flow — Complete Picture

Here's how both features compose in the full system:

```
[ Claude Code session ]
    │
    ├── (always) Runs as OS process → discoverable via ps/proc
    │
    └── (Mode 2 only) Writes .crystal-ball.json → richer context
                │
                v
[ Local Daemon ]
    │
    ├── Polls OS for process stats (Mode 1 — always)
    ├── Reads .crystal-ball.json if present (Mode 2 — automatic)
    ├── Classifies state (OS heuristics + sidecar data)
    ├── Groups sessions by cwd basename
    │
    ├── Serves GET /api/sessions → local browser (always)
    │
    └── (if --share enabled)
        POST /api/publish → Central Relay
                              │
                              v
                    [ Central Relay Server ]
                      │
                      ├── Stores latest snapshot per user
                      ├── Merges groups across users
                      ├── Expires stale users (30s timeout)
                      │
                      └── Serves GET /api/combined → any browser
                                    │
                                    v
                          [ Browser — Three.js View ]
                            │
                            ├── If viewing local only:
                            │     polls GET /api/sessions (local daemon)
                            │
                            └── If viewing combined:
                                  polls GET /api/combined (relay server)
                                  includes player colours, roster, merged groups
```

### 4.1 Session Data Schema — Complete V1

The session object now has optional fields for Mode 2 and multi-person:

```json
{
  "id": "claude-48231",
  "user": "tomek",
  "user_color": "#e8843a",
  "pid": 48231,
  "cwd": "/home/tomek/projects/isaval-erp",
  "cpu": 43.2,
  "mem": 187.4,
  "state": "active",
  "age_seconds": 1247,
  "tty": "/dev/pts/3",
  "has_children": true,
  "group": "isaval-erp",
  "mode": 1,
  "context": null
}
```

Mode 2 session (with context):

```json
{
  "id": "claude-48231",
  "user": "tomek",
  "user_color": "#e8843a",
  "pid": 48231,
  "cwd": "/home/tomek/projects/isaval-erp",
  "cpu": 43.2,
  "mem": 187.4,
  "state": "active",
  "age_seconds": 1247,
  "tty": "/dev/pts/3",
  "has_children": true,
  "group": "isaval-erp",
  "mode": 2,
  "context": {
    "task": "Refactoring auth middleware for OAuth2",
    "phase": "coding",
    "blocked": false,
    "detail": "Working on token refresh logic",
    "stale": false
  }
}
```

The `mode` field is an integer (1 or 2). The `context` field is `null` for Mode 1 and an object for Mode 2. The `context.stale` boolean is set by the daemon when the sidecar `updated_at` is older than 10 minutes.

For local-only mode (no relay configured), `user` and `user_color` can be omitted or set to defaults.

---

## Part 5: Relay Server — Project Structure

```
crystal-ball-relay/
├── package.json
├── README.md
├── server/
│   ├── index.js              # Express app
│   ├── store.js              # In-memory user snapshot store with expiry
│   ├── merger.js             # Group merging logic across users
│   └── auth.js               # Simple token validation
└── tests/
    ├── store.test.js          # Snapshot storage, expiry, overwrites
    ├── merger.test.js         # Group merging, collision handling, namespace prefixing
    └── api.test.js            # Endpoint response shapes, filtering, auth
```

**package.json:**
```json
{
  "name": "crystal-ball-relay",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test tests/**/*.test.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

**CLI flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3001` | Relay server port |
| `--token` | none | Shared secret for publish auth. If unset, no auth. |
| `--expiry` | `30000` | Ms before a user's snapshot expires (they went offline) |

---

## Part 6: Changes to Local Daemon (crystal-ball)

### 6.1 New Files

```
crystal-ball/
├── server/
│   ├── discovery/
│   │   └── sidecar.js         # Reads .crystal-ball.json from session cwd
│   ├── relay/
│   │   ├── publisher.js       # POSTs snapshots to relay server
│   │   └── subscriber.js      # GETs combined data from relay server
│   └── classifier.js          # UPDATED — incorporates sidecar data
├── public/
│   ├── js/
│   │   ├── playerColors.js    # Player colour management and unit tinting
│   │   ├── roster.js          # Player roster panel
│   │   ├── worldManager.js    # UPDATED — handles multi-user units and merged groups
│   │   ├── units.js           # UPDATED — player banner/flag on units
│   │   ├── stateVisuals.js    # UPDATED — blocked state, phase-driven activities
│   │   ├── selectionPanel.js  # UPDATED — shows user, mode, context
│   │   ├── hud.js             # UPDATED — blocked counter, user count
│   │   └── api.js             # UPDATED — can poll local or relay endpoint
```

### 6.2 New CLI Flags

Added to existing crystal-ball daemon:

| Flag | Default | Description |
|------|---------|-------------|
| `--relay-url` | none | Central relay URL. Enables multi-person features when set. |
| `--user-name` | OS username | This user's display name |
| `--user-color` | auto | Player colour (hex). Auto-assigns from a preset palette if unset. |
| `--share` | `false` | Publish sessions to relay. Explicit opt-in. |
| `--include-users` | `*` | Filter which users to show in combined view. |

### 6.3 Updated Startup Modes

```bash
# V0: local only, passive monitoring, real sessions
npm start

# V0: local only, simulation mode
npm run simulate

# V1: local with Mode 2 sidecar reading (automatic if .crystal-ball.json exists)
npm start
# (no config change — sidecar reading is always on)

# V1: multi-person, sharing enabled
npm start -- --relay-url=http://team-server:3001 --share --user-name=tomek --user-color=#e8843a

# V1: multi-person, view only (see others but don't share)
npm start -- --relay-url=http://team-server:3001 --user-name=tomek

# V1: multi-person, filtered view
npm start -- --relay-url=http://team-server:3001 --share --include-users=tomek,sarah
```

### 6.4 Browser Mode Switching

The browser should auto-detect whether multi-person data is available. The API endpoint changes based on configuration:

- **Local only:** Browser polls `GET /api/sessions` (same as V0)
- **Multi-person:** Browser polls `GET /api/combined` which the local daemon proxies from the relay (or the browser can poll the relay directly if CORS is configured)

For simplicity in V1: the local daemon proxies the relay data. The browser always talks to localhost. The daemon decides whether to serve local-only or combined data based on whether `--relay-url` is configured. This avoids CORS complexity and keeps the browser code simpler.

Local daemon serves:
- `GET /api/sessions` — always available, local sessions only
- `GET /api/combined` — available when relay configured, returns merged data
- `GET /api/mode` — returns `{ "mode": "local" | "multi", "user": "tomek", "relay": "http://..." }`

The browser checks `/api/mode` on startup and switches its polling target accordingly.

---

## Part 7: Updated Simulation Mode

The simulator must be extended to support both new features:

### 7.1 Mode 2 Simulation

Some simulated sessions should have Mode 2 context. Roughly 60% of simulated sessions should be Mode 2, 40% Mode 1 — this tests the mixed-mode visualisation.

Mode 2 simulated sessions should have realistic task descriptions and cycle through phases over time. One or two should periodically enter `blocked: true` state.

### 7.2 Multi-Person Simulation

When `--simulate` is combined with multi-person flags, the simulator should generate data for 2–3 fake users in addition to the local user. Each fake user has:

- A name and colour
- 2–5 sessions across 2–3 groups
- A mix of Mode 1 and Mode 2 sessions
- Realistic state transitions over time

This allows full development and demo of the multi-person view without needing actual remote users.

```bash
# Full simulation: multi-person + mixed modes
SIMULATE=true npm start -- --relay-url=simulated --share --user-name=tomek
```

When `--relay-url=simulated`, the daemon doesn't connect to a real relay. Instead, the subscriber returns simulated multi-user data.

---

## Part 8: Testing — V1 Additions

### 8.1 Server Tests

**sidecar.test.js:**
- Valid `.crystal-ball.json` is parsed correctly
- Missing file returns null (Mode 1 fallback)
- Malformed JSON returns null with warning
- Stale file (updated_at > 10 min ago) is flagged
- All phase values are accepted
- Invalid phase value is handled gracefully
- Fields beyond the schema are ignored (forward-compatible)

**classifier.test.js (updated):**
- Mode 2 session with `phase: coding` + high CPU → state: active, phase preserved
- Mode 2 session with `phase: coding` + zero CPU for 15 min → state: idle, context marked stale
- Mode 2 session with `blocked: true` → blocked overrides OS-inferred state
- Mode 1 session at same gathering point as Mode 2 sessions → inherits group activity

**publisher.test.js:**
- Publishes correct payload shape to relay URL
- Handles relay server being unavailable (logs warning, doesn't crash)
- Includes auth token when configured
- Respects --share flag (doesn't publish when false)

**subscriber.test.js:**
- Parses combined response correctly
- Handles relay unavailable gracefully
- Filters by --include-users
- Handles empty user list (no other users online)

### 8.2 Relay Server Tests

**store.test.js:**
- Stores snapshot per user
- Overwrites previous snapshot for same user
- Expires snapshots after configured timeout
- Returns correct online user list
- Handles concurrent publishes from many users

**merger.test.js:**
- Groups with same basename from different users are merged
- Session IDs are correctly namespaced (user/id)
- Merged group lists all contributing users
- Group session counts are accurate
- Single-user group works (no merge needed)

**api.test.js:**
- POST /api/publish with valid token succeeds
- POST /api/publish with invalid token returns 401
- POST /api/publish with no token when token required returns 401
- GET /api/combined returns all users by default
- GET /api/combined?include=tomek returns only tomek's sessions
- GET /api/combined?exclude=alex excludes alex
- GET /api/users returns online users with correct metadata
- Expired user is not included in responses

### 8.3 Client Tests (updated)

**worldManager.test.js (additions):**
- Multi-user sessions at same group → same building, different player colours
- Mode 2 session → phase-specific activity (not random)
- Mixed Mode 1 and Mode 2 at same group → Mode 1 inherits group activity
- Blocked session → red alert visual triggered
- User goes offline → their units fade/remove
- New user comes online → their units spawn

---

## Part 9: Implementation Order

Recommended build sequence for Claude Code:

1. **Sidecar reader** (`server/discovery/sidecar.js`) — read and validate `.crystal-ball.json`
2. **Classifier update** — incorporate sidecar data into state classification
3. **Session schema update** — add `mode`, `context` fields to API response
4. **Simulator update** — generate mixed Mode 1/Mode 2 sessions
5. **Frontend: phase-driven activities** — Mode 2 sessions use phase for animation, not random
6. **Frontend: blocked state visuals** — red glow, alert icon, HUD counter
7. **Frontend: selection panel update** — show context data for Mode 2 sessions
8. **Relay server** — new project, full implementation
9. **Publisher + subscriber** — local daemon relay integration
10. **Multi-person simulation** — fake users in simulator
11. **Frontend: player colours** — unit banners/flags, colour tinting
12. **Frontend: roster panel** — user list with filtering
13. **Frontend: multi-person HUD** — user count, updated counters
14. **Frontend: building label updates** — per-user dot indicators
15. **Tests** — throughout, but especially after steps 1–4 and 8–9

Steps 1–7 are Mode 2 (no networking). Steps 8–14 are Multi-Person. Each set is independently shippable.

---

## Part 10: Deferred to V2+

- Push-based context reporting (Claude → HTTP endpoint instead of sidecar file)
- Project identifiers in sidecar to fix false-merge problem
- Persistent relay storage (history, replay)
- WebSocket connections (replace polling for lower latency)
- User authentication with proper identity (OAuth, etc.)
- Role-based views (manager sees all, IC sees own team)
- Alert routing (blocked notification → Slack/email)
- Custom phase vocabularies per team
- Gathering point custom labels (override basename with human-readable name)
- Cross-machine file path normalisation for better group merging
- Dashboard mode (read-only large-screen display for team rooms)