# Feature Guide -- Age of the Crystal Ball

> Single source of truth for every feature in the application.

---

## Overview

- Isometric AoE2/Monument Valley-style Three.js visualization of Claude Code sessions
- Express server discovers Claude processes, classifies state, serves REST API
- Browser polls API every 2s, renders an isometric town where each session is a villager-unit
- 30 client modules, 7 server modules, 483 tests (421 client + 62 server)
- ESM throughout, no bundler, Three.js r160 via CDN importmap

---

## Architecture

```
Server (Node.js / Express)
  server/index.js              -- Express app, static files, polling loop
  server/classifier.js         -- Rolling CPU history, state heuristics
  server/sessionStore.js       -- In-memory store, grouping, idle economics, Mode 2 merge
  server/discovery/index.js    -- Platform detection (simulator vs macOS)
  server/discovery/simulator.js -- 12 fake sessions, Mode 2 phase cycling
  server/discovery/macos.js    -- Real macOS process discovery (ps + lsof)
  server/discovery/sidecar.js  -- Central sidecar dir reader for Mode 2

Client (ES modules via importmap)
  30 modules in public/js/
```

### API

Single endpoint: `GET /api/sessions`

Returns: `{ timestamp, sessions[], groups[], metrics }`

| Field | Contents |
|---|---|
| Session | id, pid, cwd, cpu, mem, state, age_seconds, tty, has_children, group, mode (1 or 2), context (null or {task, phase, blocked, detail, stale}) |
| Metrics | awaitingAgentMinutes, longestWait, blockedCount |

### Startup

```bash
npm start          # Real macOS process discovery
npm run simulate   # 12 fake sessions across 5 groups
npm test           # 483 tests
```

---

## Server

### State Classification (classifier.js)

Rolling 10-reading CPU history per PID:

| State | Condition |
|---|---|
| stale | TTY detached, or dormant >30 min with all readings <1% |
| active | 2+ consecutive recent readings >10% |
| awaiting | CPU <5%, TTY attached, quiet 10-60s |
| idle | Fallback |

### Mode 2: Active Context (sidecar.js + sessionStore.js)

Two context modes coexist:

| Mode | Name | Description |
|---|---|---|
| 1 | Passive | OS-level inference only. Default for all sessions. |
| 2 | Active | Session writes a sidecar JSON file with task/phase/blocked/detail. |

Sidecar files stored centrally at `~/.crystal-ball/sessions/` (configurable via `CRYSTAL_BALL_DIR` env var). Named `<session_id>.json`, containing a `cwd` field for matching to discovered processes.

`resolveState(osState, sidecarContext)` logic:

- No sidecar: OS state wins
- sidecar.blocked: state becomes `blocked`
- Stale sidecar + idle/stale OS: OS state wins
- Otherwise: OS state (sidecar enriches context but does not override classification)

Session output gains: `mode: 1|2`, `context: null|{task, phase, blocked, detail, stale}`

### Simulator (simulator.js)

- 12 sessions across 5 groups: SimExLab (4), FPA-328 (2), INCIDENT-18071 (1), DOTFILES (3), Q1TouchPoint (2)
- Deterministic age spread (30s to 3hr)
- CPU follows smooth sine-wave curves per behavior type (active/awaiting/idle/burst)
- State transitions every 30-60s, session churn every 2-3 min
- ~60% sessions are Mode 2 with sidecar context, phase cycling every 20-40s
- ~10% chance of blocked state for 15-30s per phase transition
- 10 simulated tasks with realistic phase cycles

### macOS Discovery (macos.js)

- `ps axo pid,ppid,pcpu,rss,tty,lstart,command` to parse all processes
- Filter for Claude processes (command contains `/claude` or `@anthropic/claude-code`)
- `lsof -a -p <pid> -d cwd -Fn` for working directory
- Child detection via ppid scan
- Pure function exports for testability: parsePsOutput, filterClaudeProcesses, detectChildren, parseLsofCwd

### Idle Economics (sessionStore.js)

- Tracks cumulative agent-minutes in awaiting/blocked state
- Tracks longest current wait (name, group, seconds)
- `blocked` treated identically to `awaiting` for accumulation
- Cleans up dead PIDs automatically

---

## Scene

### Terrain (terrain.js)

24x24 grid divided into 4 quadrants. 4 biomes shuffled each page load.

| Biome | Tile Colors | Decorations |
|---|---|---|
| Meadow | Spring greens | 5% chance of wildflowers (pink, blue, cream) |
| Forest | Rich dark greens | 15% chance of low-poly trees (trunk + cone canopy) |
| Desert | Golden sand | 8% chance of rock formations (2-3 boxes) |
| Mountain | Stone, height rises to edges | Outermost tiles get white snow caps |

Additional terrain features:

- **River** -- sinusoidal diagonal path (top-left to bottom-right), width 2-3 tiles, GPU ShaderMaterial with vertex displacement for animated ripples
- **Bridge** -- auto-placed at narrowest crossing near center
- **Biome transitions** -- 2-tile-wide noise-based organic edges at quadrant boundaries (not hard lines)
- **Static geometry merging** (mergeStaticGeometry) -- terrain tiles merged, cuts draw calls ~4x. Water tiles excluded from merge (ShaderMaterial, UUID skip).

### Buildings (buildings.js)

8 types, round-robin assigned to groups:

| # | Type | Description |
|---|---|---|
| 1 | Forge | Sandstone, chimney with cap, inner orange glow |
| 2 | Library | Tall stone, half-sphere dome, windows |
| 3 | Chapel | Gable roof, spire tower with cone top, door |
| 4 | Observatory | Cylinder base, dome, slit, angled telescope with lens |
| 5 | Workshop | Open-air with 4 corner posts, flat roof, workbenches + anvil |
| 6 | Market | Two tilted canopy roofs on posts, crate goods |
| 7 | Farm | Low fence, 12 crop patches in 3 colors, gate posts |
| 8 | Lumber Camp | Lean-to shelter, 6 stacked logs, decorative axe |

Building features:

- CSS2D label with GR location name (see GR Theming section)
- Floating segmented health bar (green/yellow/grey segments for active/awaiting/idle+stale)
- Active buildings have subtle 0.5% Y-scale breathing animation
- Abandoned buildings (group disappeared) dim to 35% opacity

### GR Town Hall (townhall.js)

Permanent building at map center (0,0,0):

- Stone keep body, two asymmetric towers (red and navy cone roofs)
- GR banner on front (navy with red stripe), dark wooden door, cream windows
- Inner warm orange point light (visible through openings, especially at night)
- Standing stone monument placed 1.5 units away

### Day/Night Cycle (daynight.js)

Full cycle: 300 seconds (5 minutes). All transitions use smoothstep easing. Sun physically moves across the sky.

| Phase | Duration | Sky Color | Notable |
|---|---|---|---|
| Dawn | 45s | Soft pink/peach | Sun rises from east |
| Day | 120s | Warm parchment | Full brightness |
| Dusk | 45s | Deep amber | Sun sets west |
| Night | 90s | Deep blue | Minimal directional light |

Bloom strength dynamically adjusts by phase: Night 0.6, Dusk 0.45, Day/Dawn 0.3. All emissive effects glow dramatically brighter at night.

### Post-Processing (postprocessing.js)

Pipeline:

1. RenderPass (standard scene)
2. UnrealBloomPass -- threshold 0.85, radius 0.4, dynamic strength (see day/night)
3. Custom vignette shader -- GLSL edge darkening (offset 0.95, darkness 1.2)

Shadow maps: 2048x2048 PCFSoftShadowMap.

---

## Units

### Construction (units.js)

- Body: CylinderGeometry, head: SphereGeometry
- Named mesh children: `body`, `head`, `awaitLabel`, `childCompanion`
- userData for raycasting: `{ type: 'unit', sessionId }`
- Geometry/material caches for performance (`_geomCache`, `_accessoryMatCache`)
- `removeUnit` skips disposing shared cached resources

### 7 Unit Classes (priority order)

| Class | Condition | Color | Visual Accessory |
|---|---|---|---|
| Security (Ghost) | Stale | Grey | Body + head at 30% opacity |
| Intern (Scout) | < 2 min old | Green | Tiny glowing lantern; unit scaled to 80% |
| Engineer (Builder) | Has children | Orange | Small hammer |
| Analyst (Sentinel) | Awaiting | Gold | Flat gold shield with emissive glow |
| Principal (Veteran) | Active > 1hr | Purple | Purple cape behind body |
| Researcher (Scholar) | Active (default) | Blue | Floating book above head |
| Barista (Peasant) | Idle (fallback) | Grey | Random from 5 variants |

Barista accessories (5 variants, randomly assigned):

1. Laptop -- grey base with blue glowing screen
2. Crystal Staff -- brown staff with purple glowing orb
3. Book Stack -- three stacked books (red, blue, green), each slightly rotated
4. Magnifying Glass -- golden torus ring with wooden handle
5. Flask -- green cone flask with subtle green glow

### GR Growth Framework Ranks (units.js)

Based on session age, with role-aware titles via `rankDisplayTitle(rank, unitClass)`:

| Age | Rank | Badge |
|---|---|---|
| < 5 min | Recruit | None |
| 5-30 min | Bronze / Apprentice | Bronze sphere pip above head |
| 30 min - 2hr | Silver / Journeyman | Silver sphere pip |
| > 2hr | Gold / Master | Gold emissive sphere pip |

Tooltips show a filled star for gold rank, empty star otherwise.

### Memory Scaling (memoryScale.js)

| Memory | Scale |
|---|---|
| < 100 MB | 0.9 |
| 100-300 MB | 1.0 |
| 300-500 MB | 1.1 |
| > 500 MB | 1.2 |

Smoothly lerped. Runs before stateVisuals so stale y-squash (scale.y = 0.8) layers on top.

### Persistent Medieval Names (sessionStore.js)

46-name medieval pool. `nameFromPid(pid)` is deterministic from PID. The same PID always produces the same name (e.g., Aldric, Bronwyn, Cedric, Freya, Isolde, Leoric, Wulfric). Shown in tooltips, HUD longest wait, and selection panel.

### Child-Process Companion Orb

When a session has child processes, a small purple glowing sphere orbits the unit:

- Orbit radius 0.3, speed 2 rad/s
- Gentle sine-wave vertical float
- Emissive intensity pulses between 0.2 and 0.35
- Added/removed dynamically as child processes spawn/terminate

---

## Animations

### Activity System (activities.js)

Each group gets a deterministic activity pair (energetic for active state, passive for idle/awaiting). Mode 2 sessions use phase-driven mapping instead.

Group activity pairs (5):

| # | Energetic (Active) | Passive (Idle/Awaiting) |
|---|---|---|
| 0 | Building -- bob + fast rocking (hammering) | Scribing -- tiny bob + gentle sway |
| 1 | Mining -- fast bob + vigorous rocking | Praying -- kneeling (scale.y=0.7) + sway |
| 2 | Chopping -- slow bob + sharp rocking | Resting -- very slow gentle bob |
| 3 | Smelting -- medium bob + rocking | Foraging -- slow circular patrol (r=0.6) |
| 4 | Fishing -- 4-phase cast cycle (1s wind-up, snap forward, waiting lean) | Patrolling -- circular walk (r=1.5), faces movement direction |

Patrol and Foraging units control their own position (exempt from anchor lerp). Marching units also exempt from lerpToTarget (marchInManager controls position).

Phase activity map (Mode 2):

| Phase | Energetic | Passive |
|---|---|---|
| planning | Scribing | Scribing |
| researching | Patrolling | Patrolling |
| coding | Building | Scribing |
| testing | Mining | Praying |
| debugging | Mining | Mining |
| reviewing | Patrolling | Foraging |
| documenting | Scribing | Scribing |
| idle | Resting | Resting |

### State Visuals (stateVisuals.js)

| State | Body Color | Opacity | Emissive | Speed | Special |
|---|---|---|---|---|---|
| active | Normal class color | 100% | None | 1.0x | -- |
| awaiting | Normal | 100% | Gold pulse (1Hz, 0.0-0.5 intensity) | 0.5x | Golden "!" CSS2D label (max 20 labels) |
| blocked | Normal | 100% | Red pulse (3Hz) | 0.3x | Red "X" CSS2D label (max 20 labels) |
| idle | Desaturated grey | 80% | None | 0.5x | -- |
| stale | Dark grey | 40% | None | 0x (frozen) | scale.y = 0.8 (slumped) |

Note: applyStateVisuals runs BEFORE activity animations (order matters for speedMultiplier).

### Particles (particles.js)

6 types, additive blending, radial-gradient circle textures, max 20 active groups (oldest evicted):

| Particle | Trigger | Count | Behavior |
|---|---|---|---|
| Builder Sparks | Every 2.5s for Engineers | 8-12 | Orange burst upward with gravity |
| Scholar Pages | Every 4s for Researchers | 3-5 | White/parchment float upward |
| Sentinel Rings | Persistent for Analysts | 1 ring | Gold ring expands + fades on 2s loop |
| Ghost Wisps | Every 3s for Security | 4-6 | Grey particles with directional bias |
| Dust Burst | Unit spawn | 10-15 | Brown radial burst at ground level |
| Death Motes | Unit death / victory | 8-10 | White/gold scatter upward |

### March-In (marchIn.js)

New units spawn at nearest map edge, march to anchor over 2s with easeOutQuad. Dust burst at spawn point.

### Gravestones (marchIn.js)

When a session dies:

- Grey gravestone with cross appears at last position
- Death motes (gold particles) scatter upward simultaneously
- Fully visible for 6s, then fades linearly over 54s
- Removed and disposed after 60s total

### Victory Screen (marchIn.js)

Triggered when all sessions are simultaneously active:

- Gold "FULL DEPLOYMENT" / "MARKET OPEN" text at 48px Cinzel with pulsing glow
- 5 bursts of gold confetti particles from random positions
- Visible for 5s, fades over 0.5s
- 30s cooldown before re-trigger

---

## Interaction

### Selection (selection.js)

| Action | Effect |
|---|---|
| Click unit | Select it, show detail panel |
| Click building | Select all units in that group |
| Click empty ground | Deselect all |
| Shift-click | Toggle individual unit in/out of selection |
| Box-select (drag >5px) | Green translucent rectangle, selects all units within |

Selected units get green emissive glow (0x44ff44).

### Double-Click (doubleClick.js)

350ms threshold:

| Action | Effect |
|---|---|
| Double-click unit | Select all units of same class across map |
| Double-click building | Select all units in that group |

### Keyboard Hotkeys (hotkeys.js)

All shortcuts suppressed when focus is in an input, textarea, or select element.

| Key | Action |
|---|---|
| Space | Jump to longest-awaiting unit |
| A | Select all awaiting units |
| 1-5 | Jump to platoon building N |
| F | Focus camera on selection |
| Q | Rotate camera 90 degrees counter-clockwise |
| E | Rotate camera 90 degrees clockwise |
| Tab | Toggle War Room |
| M | Toggle minimap |
| H | Toggle heatmap |
| Esc | Deselect all, close panels |
| Arrow keys | Pan camera |
| ? | Toggle hotkey help overlay |

### Camera (scene.js, cameraRotation.js)

- Orthographic at true isometric angle (10, 10, 10)
- Scroll zoom: viewSize 6 (tactical) to 30 (strategic), zoom-to-cursor, smooth lerp
- Drag panning: isometric-aware projection math
- Arrow key panning
- 90-degree snap rotation (Q/E): smooth exponential lerp between NE/SE/SW/NW (~500ms)
- Intro zoom: starts at viewSize 35, eases to 14 over 3s

### Minimap (minimap.js, M key)

150x150 canvas, bottom-left corner:

- Biome-accurate terrain colors
- White 4x4 squares for buildings
- 2x2 colored dots for units (state-colored)
- White viewport rectangle showing camera frustum
- Click to teleport camera

### Tooltips (tooltips.js)

Hover over a unit for 300ms to see a parchment-styled card:

- Medieval name + class (e.g., "Aldric the Engineer")
- Rank badge (star) + title
- State (color-coded), CPU%, Memory, Uptime, Platoon
- Auto-flips to avoid viewport overflow

### Heatmap Mode (heatmap.js, H key)

Terrain tiles recolor based on total CPU of sessions in the nearest building's group:

| Total CPU | Color |
|---|---|
| > 100% | Hot red |
| 50-100% | Warm orange |
| 10-50% | Yellow-green |
| < 10% | Cold blue |

Colors interpolated between thresholds. Smooth transitions via lerp factor 0.15 per cycle. Original terrain colors cached and restored on toggle-off.

---

## UI Panels

### HUD (hud.js)

Top bar showing:

- Session counts by state: active / awaiting / blocked / idle / stale
- Total CPU and memory
- Await-min -- cumulative agent-minutes spent awaiting/blocked across all sessions
- Longest -- name, group, and duration of the longest-waiting unit
- Awaiting count pulses gold when any sessions are awaiting
- Blocked count pulses red

### Selection Panel (selectionPanel.js)

Bottom-center overlay, three view modes:

| View | Contents |
|---|---|
| Unit view | Name, class, rank, state, PID, CPU bar, memory, uptime, terminal, children count. Mode 2: task, phase badge (colored), detail, blocked indicator. |
| Group view | Building name, unit count, state distribution, per-unit list. Mode 2: blocked count. |
| Multi-unit view | Count, state distribution summary. |

### War Room (warroom.js, Tab key)

350px slide-in panel with 4 sections:

| Section | Contents |
|---|---|
| Army Overview | Total sessions, CPU, memory, colored state bar (including blocked segment) |
| Platoon Leaderboard | Groups ranked by activity score: active=3, awaiting=1, blocked=0, idle=0, stale=-1 |
| Activity Feed | Live log of state transitions (max 20 entries), timestamped, color-coded |
| Mode 2 Intel | Mode 1 vs Mode 2 counts, phase distribution, blocked sessions list |

### Loading Screen (loading.js)

- Dark background (#1a1a2e)
- "Age of the Crystal Ball" title in Cinzel serif, gold
- "Warming up the models..." subtitle in IBM Plex Mono
- Pulsing crystal ball orb (purple radial gradient with glow + scale animation)
- Progress bar filling through initialization steps
- 800ms fade-out on complete

### Performance Monitor (perfMonitor.js)

FPS counter and draw call count (toggle via console or debug flag).

### Hotkey Help Overlay (? key)

Overlay panel listing all keyboard shortcuts. Toggled with the `?` key.

---

## GR Theming

### Building Labels (buildings.js)

| Building Type | GR Location Name |
|---|---|
| Forge | Soho Place |
| Library | Res Lab |
| Chapel | Guernsey |
| Observatory | Signal Tower |
| Workshop | Dallas |
| Market | The Cafe |
| Farm | The Farm |
| Lumber Camp | Stamford |

### Simulator Groups

SimExLab, FPA-328, INCIDENT-18071, DOTFILES, Q1TouchPoint

### Language Mapping

| Medieval Term | GR Term |
|---|---|
| War Room | Trading Floor |
| Army | Portfolio |
| Platoon | Desk |
| Activity Feed | Trade Log |
| FULL DEPLOYMENT | MARKET OPEN |
| Scrying | Warming up the models |

### Brand Colors

- Baby blue: 0x89CFF0
- Yellow: 0xFFD700
- Black: 0x1A1A1A

---

## Claude Code Hook

### PostToolUse Hook (hooks/crystal-ball-hook.sh)

Bash script that runs after every tool use in a Claude Code session. Writes sidecar files to `$CRYSTAL_BALL_DIR` (default `~/.crystal-ball/sessions/`), named `<session_id>.json`.

Phase inference from tool name:

| Tool | Inferred Phase |
|---|---|
| Read, Grep, Glob | researching |
| Write, Edit | coding |
| Bash with test commands | testing |
| Bash with git diff/log | reviewing |
| Task, Plan tools | planning |
| Default | coding |

Detail extracted from tool_input (file_path, command, pattern). Atomic writes via tmp+mv. No LLM invocation -- pure bash/jq.

### Onboarding (hooks/crystal-ball-skill.md)

Markdown doc explaining the sidecar protocol, central directory, CRYSTAL_BALL_DIR env var, and hook installation.

---

## Performance Optimizations

| Optimization | Impact |
|---|---|
| Static geometry merging (mergeStaticGeometry) | Terrain tiles merged, cuts draw calls ~4x |
| Water tile exclusion from merge | ShaderMaterial preserved (UUID skip) |
| Geometry/material caches (_geomCache, _accessoryMatCache) | Shared across units |
| Health bar geometry precomputed | Avoids per-frame allocation |
| Await/blocked label caps | Max 20 each to limit CSS2D overhead |
| removeUnit skips shared resource disposal | Prevents invalidating cached geometry/materials |
| GPU water shader | Vertex displacement instead of CPU animation |
