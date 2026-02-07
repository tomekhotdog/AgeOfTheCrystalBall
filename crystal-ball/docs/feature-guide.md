# Feature Guide — Age of the Crystal Ball

A comprehensive reference of every feature in the application, including interactions, visuals, and hidden details.

---

## Keyboard Shortcuts

All shortcuts are suppressed when focus is in an input, textarea, or select element.

| Key | Action |
|---|---|
| **Space** | Jump camera to the longest-awaiting unit (idle villager button) |
| **A** | Select all awaiting units |
| **1-5** | Jump camera to platoon building 1-5 |
| **F** | Focus camera on current selection |
| **Q** | Rotate camera 90° counter-clockwise |
| **E** | Rotate camera 90° clockwise |
| **Tab** | Toggle War Room panel |
| **M** | Toggle minimap |
| **H** | Toggle CPU heatmap overlay |
| **Esc** | Deselect all, close panels |

---

## Selection & Interaction

### Click
- **Click a unit** — select it, show detail panel
- **Click a building** — select all units in that group
- **Shift-click** — toggle individual units in/out of selection without clearing others
- **Click empty ground** — deselect all

### Double-Click (350ms threshold)
- **Double-click a unit** — select all units of the same class across the entire map
- **Double-click a building** — select all units in that building's group

### Box-Select
- Click and drag (>5px movement) draws a green translucent rectangle
- All units whose screen-projected positions fall within the box are selected
- Selected units get a green emissive glow (0x44ff44)

### Minimap Interaction
- Click anywhere on the minimap to teleport the camera to that world position

---

## Unit Classes

Every session is classified into one of seven medieval classes (priority: Ghost > Scout > Builder > Sentinel > Veteran > Scholar > Peasant):

| Class | Condition | Color | Visual Accessory |
|---|---|---|---|
| **Ghost** | Stale session | Grey | Body + head at 30% opacity |
| **Scout** | < 2 minutes old | Green | Tiny glowing lantern; unit scaled to 80% |
| **Builder** | Has child processes | Orange | Small hammer |
| **Sentinel** | Awaiting state | Gold | Flat gold shield with emissive glow |
| **Veteran** | Active > 1 hour | Purple | Purple cape behind body |
| **Scholar** | Active (default) | Blue | Floating book above head |
| **Peasant** | Idle (fallback) | Grey | Random: laptop, crystal staff, book stack, magnifying glass, or flask |

### Peasant Accessories (5 variants)
1. **Laptop** — grey base with blue glowing screen
2. **Crystal Staff** — brown staff with purple glowing orb
3. **Book Stack** — three stacked books (red, blue, green), each slightly rotated
4. **Magnifying Glass** — golden torus ring with wooden handle
5. **Flask** — green cone flask with subtle green glow

---

## Medieval Names

Every unit gets a deterministic name from a 46-name pool based on PID (e.g. Aldric, Bronwyn, Cedric, Freya, Isolde, Leoric, Wulfric). The same PID always produces the same name. Visible in tooltips and the HUD's "Longest wait" display.

---

## Rank Badges

Units earn rank badges based on session age:

| Age | Rank | Title | Visual |
|---|---|---|---|
| < 5 min | Recruit | Recruit | No badge |
| 5-30 min | Bronze | Apprentice | Bronze sphere pip above head |
| 30 min - 2 hr | Silver | Journeyman | Silver sphere pip |
| > 2 hr | Gold | Master | Gold sphere pip with emissive glow |

Tooltips show a filled star for gold rank, empty star otherwise.

---

## State-Driven Visuals

| State | Body Color | Opacity | Emissive | Animation Speed | Special |
|---|---|---|---|---|---|
| **Active** | Normal class color | 100% | None | 1.0x | — |
| **Awaiting** | Normal | 100% | Gold pulse (0.0-0.5 intensity) | 0.5x | Floating golden "!" label |
| **Idle** | Desaturated grey | 80% | None | 0.5x | — |
| **Stale** | Dark grey | 40% | None | 0x (frozen) | Scale.y = 0.8 (slumped) |

---

## Child-Process Companion Orb

When a session has child processes, a small purple glowing sphere orbits the unit:
- Orbit radius 0.3, speed 2 rad/s
- Gentle sine-wave vertical float
- Emissive intensity pulses between 0.2 and 0.35
- Added/removed dynamically as child processes spawn/terminate

---

## Activity Animations

Each group is deterministically assigned an activity pair (energetic for active, passive for non-active):

| Group Index | Energetic (Active) | Passive (Idle/Awaiting) |
|---|---|---|
| 0 | **Building** — bob + fast rocking (hammering) | **Scribing** — tiny bob + gentle sway |
| 1 | **Mining** — fast bob + vigorous rocking | **Praying** — kneeling (scale.y=0.7) + sway |
| 2 | **Chopping** — slow bob + sharp rocking | **Resting** — very slow gentle bob |
| 3 | **Smelting** — medium bob + rocking | **Foraging** — slow circular patrol (r=0.6) |
| 4 | **Fishing** — 4-phase cast cycle | **Patrolling** — circular walk (r=1.5), faces direction |

The Fishing animation has a detailed 4-second cycle: 1s lean-back wind-up, snap forward to 0.3 rad cast, then a waiting lean period.

Patrol and Foraging units control their own position (exempt from anchor lerp).

---

## Particle Effects

Six particle types, all using additive blending with radial-gradient circle textures:

| Particle | Trigger | Count | Behavior |
|---|---|---|---|
| **Builder Sparks** | Every 2.5s for Builders | 8-12 | Orange burst upward with gravity |
| **Scholar Pages** | Every 4s for Scholars | 3-5 | White/parchment float upward |
| **Sentinel Rings** | Persistent for Sentinels | 1 ring | Gold ring expands + fades on 2s loop |
| **Ghost Wisps** | Every 3s for Ghosts | 4-6 | Grey particles with directional bias |
| **Dust Burst** | Unit spawn | 10-15 | Brown radial burst at ground level |
| **Death Motes** | Unit death / victory | 8-10 | White/gold scatter upward |

Max 20 active particle groups (oldest evicted).

---

## Day/Night Cycle

Full cycle: 300 seconds (5 minutes), four phases:

| Phase | Duration | Sky | Notable |
|---|---|---|---|
| **Dawn** | 45s | Peachy | Sun rises from east horizon |
| **Day** | 120s | Warm parchment | Sun at zenith, full brightness |
| **Dusk** | 45s | Amber | Sun sets to west horizon |
| **Night** | 90s | Deep blue | Minimal directional light |

All transitions use smoothstep easing. Sun physically moves across the sky.

### Night Bloom Boost
Bloom strength is dynamically adjusted by phase:
- Night: 0.6 (2x default)
- Dusk: 0.45
- Day/Dawn: 0.3

All emissive effects (shields, staffs, lanterns, orbs, building lights) glow dramatically brighter at night.

---

## Post-Processing Pipeline

1. **Standard scene render** (RenderPass)
2. **HDR Bloom** (UnrealBloomPass) — threshold 0.85, radius 0.4, dynamic strength
3. **Custom Vignette Shader** — GLSL darkening at viewport edges (offset 0.95, darkness 1.2)

Shadow maps: 2048x2048 with PCFSoftShadowMap.

---

## Heatmap Mode (H key)

Terrain tiles recolor based on total CPU of sessions in the nearest building's group:

| Total CPU | Color |
|---|---|
| > 100% | Hot red |
| 50-100% | Warm orange |
| 10-50% | Yellow-green |
| < 10% | Cold blue |

Colors are interpolated between thresholds and the transition fades in smoothly (lerp factor 0.15 per cycle). Original terrain colors are cached and restored on toggle-off.

---

## March-In & Gravestones

### March-In
New units spawn at the nearest map edge and march to their anchor position over 2 seconds with easeOutQuad easing. A dust burst fires at the spawn point.

### Gravestones
When a session dies:
- A tiny grey gravestone with a cross appears at the last position
- Fully visible for 6 seconds, then fades linearly over 54 seconds
- Removed and disposed after 60 seconds total
- Death motes (gold particles) scatter upward simultaneously

---

## Memory-Based Unit Scaling

Units physically grow or shrink based on memory usage:

| Memory | Scale |
|---|---|
| < 100 MB | 0.9 (smaller) |
| 100-300 MB | 1.0 (normal) |
| 300-500 MB | 1.1 (bigger) |
| > 500 MB | 1.2 (noticeably larger) |

Transitions are smoothly lerped. Runs before stateVisuals so stale y-squash layers on top.

---

## Victory Screen — "FULL DEPLOYMENT"

When all sessions are simultaneously active:
- Gold "FULL DEPLOYMENT" text in Cinzel serif at 48px with pulsing glow
- 5 bursts of gold confetti particles from random positions
- Visible for 5 seconds, fades over 0.5s
- 30-second cooldown before it can re-trigger

---

## GR Town Hall

Permanent building at map center (0,0,0):
- Stone keep body with two asymmetric towers (red and navy cone roofs)
- GR banner on front (navy with red stripe)
- Dark wooden door, cream window cutouts
- Inner warm orange point light (visible through openings, especially at night)
- Standing stone monument placed 1.5 units away

---

## Buildings (8 types, round-robin assigned)

1. **Forge** — sandstone, chimney with cap, inner orange glow
2. **Library** — tall stone, half-sphere dome, multiple windows
3. **Chapel** — gable roof, spire tower with cone top, door
4. **Observatory** — cylinder base, dome, slit, angled telescope with lens
5. **Workshop** — open-air with 4 corner posts, flat roof, workbenches + anvil
6. **Market** — two tilted canopy roofs on posts, crate goods underneath
7. **Farm** — low fence enclosing 12 crop patches in 3 colors, gate posts
8. **Lumber Camp** — lean-to shelter, 6 stacked log cylinders, decorative axe

Each building has a CSS2D label and a floating segmented health bar.

### Building Health Bars
- Dark transparent background
- Three colored segments side-by-side: green (active), yellow (awaiting), grey (idle+stale)
- Billboards toward camera every frame

### Building Breathing
Active buildings have a barely perceptible 0.5% Y-scale oscillation. Abandoned buildings (group disappeared) dim to 35% opacity.

---

## Terrain

24x24 grid divided into four quadrants, each assigned a random biome (shuffled each page load):

| Biome | Tile Colors | Decorations |
|---|---|---|
| **Meadow** | Spring greens | 5% chance of wildflowers (pink, blue, cream) |
| **Forest** | Rich dark greens | 15% chance of low-poly trees (trunk + cone canopy) |
| **Desert** | Golden sand | 8% chance of rock formations (2-3 boxes) |
| **Mountain** | Stone, height rises to edges | Outermost tiles get white snow caps |

### River
- Flows top-left to bottom-right with sinusoidal meandering
- Width varies 2-3 tiles
- Water tiles have animated vertex-displaced sine-wave ripples

### Bridge
Auto-placed at the narrowest river crossing near map center.

### Biome Transitions
2-tile-wide zones at quadrant boundaries use noise-based organic edges (not hard lines).

---

## Camera System

- **Orthographic** at true isometric angle (10, 10, 10)
- **Scroll zoom** — view size 6 (tactical) to 30 (strategic), proportional to current zoom, smooth lerp
- **Isometric-aware panning** — drag math accounts for projection angle
- **Rotation (Q/E)** — snaps between NE, SE, SW, NW with smooth exponential lerp (~500ms)
- **Intro zoom** — first load starts at viewSize 35 and eases in to 14 over 3 seconds

---

## War Room (Tab)

350px slide-in panel with three sections:
1. **Army Overview** — total sessions, CPU, memory, colored state distribution bar
2. **Platoon Leaderboard** — groups ranked by activity score (active=3, awaiting=1, idle=0, stale=-1)
3. **Activity Feed** — live log of state transitions (max 20 entries), timestamped with color coding

---

## Minimap (M key)

150x150 canvas, bottom-left corner:
- Biome-accurate terrain colors
- White 4x4 squares for buildings
- 2x2 colored dots for units (green/yellow/grey/dark grey by state)
- White viewport rectangle showing camera frustum
- Click to teleport camera

---

## Tooltips

Hover over a unit for 300ms to see a parchment-styled card:
- Medieval name + class (e.g. "Aldric the Builder")
- Rank badge (star) + title
- State (color-coded), CPU%, Memory, Uptime, Platoon
- Auto-flips to avoid viewport overflow

---

## HUD

Top bar showing:
- Session counts by state (active / awaiting / idle / stale)
- Total CPU and memory
- **Await-min** — cumulative agent-minutes spent awaiting across all sessions
- **Longest** — name, group, and duration of the longest-waiting unit
- Awaiting count pulses gold when any sessions are awaiting

---

## Loading Screen

- Dark background (#1a1a2e)
- "Age of the Crystal Ball" title in Cinzel serif, gold
- Pulsing crystal ball orb (purple radial gradient with glow + scale animation)
- "Scrying your realm..." subtitle in IBM Plex Mono
- Progress bar filling through initialization steps
- 800ms fade-out on complete

---

## Simulator (Demo Mode)

Generates 12 sessions across 5 themed groups: SimExLab (4), FPA-328 (2), INCIDENT-18071 (1), DOTFILES (3), Q1TouchPoint (2).

- Sessions start with deterministic age spread (30s to 3hr)
- CPU follows smooth sine-wave curves by behavior type
- Dynamic events: random state transitions every 30-60s, session churn every 2-3 min
- Active/burst sessions have 1% chance per poll of toggling child processes

---

## Server Classifier

Sessions are classified using a rolling 10-reading CPU history:
- **Stale** — TTY detached, or dormant >30 min with all readings <1%
- **Active** — 2+ consecutive recent readings >10%
- **Awaiting** — CPU <5%, TTY attached, quiet 10-60s
- **Idle** — fallback
