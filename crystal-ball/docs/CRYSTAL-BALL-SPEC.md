# G-Research: Age of the Crystal Ball

## Product Design Specification — V0 (MVP)

**Working title:** Age of the Crystal Ball
**Concept:** A browser-based, Monument Valley–inspired isometric town that acts as a live visualisation of all local Claude Code sessions. Each Claude process becomes a villager-unit in a stylised settlement. The system uses OS-level process signals and maps them to believable in-game behaviours. The result is a situational awareness dashboard disguised as a strategy game.

**Design references:** Age of Empires II (interaction model, unit clustering, selection UX), Monument Valley (visual style, geometric architecture, orthographic 3D), Townscaper (procedural warmth, soft palette, generative buildings).

---

## 1. Architecture Overview

The system is a single Node.js process that does three things:

1. **Process Inspector** — discovers Claude Code sessions, reads OS-level stats, groups them by working directory
2. **Static File Server** — serves the browser-based Three.js frontend on `localhost:3000`
3. **REST API** — exposes one endpoint (`GET /api/sessions`) that the frontend polls every 2 seconds

```
[ macOS / Linux host ]
        |
        |  (ps / /proc)
        v
[ Node.js Server ]
  ├── Process Inspector (polls every 2s)
  ├── Express static server (serves /public)
  └── GET /api/sessions → JSON
        |
        v
[ Browser — Three.js Isometric View ]
  ├── Orthographic 3D scene
  ├── Unit meshes + animations
  ├── Building meshes (gathering points)
  ├── Procedural terrain
  ├── Raycaster selection
  └── HTML/CSS overlay HUD + selection panel
```

**Zero external dependencies beyond Node.js.** Three.js loaded from CDN in the browser. Server-side: Express (or Fastify) only. No database, no WebSockets, no build step, no bundler for V0.

**Cross-platform:** Must run on macOS (primary dev environment) and Linux (devpod). Process discovery needs two code paths — `ps` parsing on macOS, `/proc` filesystem on Linux. Abstract behind a common interface.

---

## 2. Data Contract

### 2.1 Session Schema — what the daemon emits

`GET /api/sessions` returns:

```json
{
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
      "group": "isaval-erp"
    }
  ],
  "groups": [
    {
      "id": "isaval-erp",
      "cwd": "/home/tomek/projects/isaval-erp",
      "session_count": 4,
      "session_ids": ["claude-48231", "claude-48290", "claude-49001", "claude-49122"]
    }
  ]
}
```

Field definitions:

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | string | Derived | `"claude-{pid}"` — stable identifier |
| `pid` | number | OS | Process ID |
| `cwd` | string | OS | Working directory — the clustering key |
| `cpu` | number | OS | CPU % (0–100+) |
| `mem` | number | OS | Memory in MB |
| `state` | enum | Derived | One of: `active`, `awaiting`, `idle`, `stale` |
| `age_seconds` | number | OS | Time since process started |
| `tty` | string | OS | Terminal path, or `"detached"` |
| `has_children` | boolean | OS | Whether Claude has spawned subprocesses |
| `group` | string | Derived | Basename of `cwd` — used for clustering |

### 2.2 State Heuristics

The daemon classifies each session into one of four states based on OS signals:

| State | Conditions | Priority |
|-------|-----------|----------|
| **`active`** | CPU > 10% sustained for > 3 seconds | Highest |
| **`awaiting`** | CPU < 5%, TTY attached, low activity for 10–60 seconds | — |
| **`idle`** | CPU < 5%, alive, quiet for > 10 minutes | — |
| **`stale`** | TTY detached, OR dormant > 30 minutes with zero CPU | Lowest |

Implementation note: the daemon should track CPU history (last ~10 readings) per PID to smooth out spikes and detect sustained activity vs transient bursts. A simple rolling average or "was above threshold for N consecutive polls" works.

### 2.3 Process Discovery

**macOS path:**
```bash
# Find Claude Code processes
ps aux | grep -E 'claude|Claude'
# Get working directory
lsof -p <PID> | grep cwd
# Get child processes
pgrep -P <PID>
```

**Linux path:**
```bash
# Scan /proc for claude processes
ls /proc/*/cmdline → filter for claude
# Working directory
readlink /proc/<PID>/cwd
# CPU/memory
/proc/<PID>/stat
# Children
/proc/<PID>/task or pgrep -P <PID>
```

Abstract both behind a `SessionDiscovery` interface:
```typescript
interface SessionDiscovery {
  discoverSessions(): Promise<RawSession[]>
}
```

With `MacOSDiscovery` and `LinuxDiscovery` implementations, selected at startup based on `process.platform`.

### 2.4 Simulation Mode

**Critical for development and demo:** The server must support a `--simulate` flag (or `SIMULATE=true` env var) that generates fake session data instead of reading real processes. This allows:

- Development of the frontend without running real Claude sessions
- Demos and screenshots
- Testing state transitions and edge cases

The simulator should generate 6–12 fake sessions across 3–4 groups, with states that change over time (sessions cycling through active → awaiting → idle, new ones appearing, old ones going stale). Working directory names should be realistic project names. CPU/memory values should fluctuate believably — not random noise, but smooth curves with occasional spikes.

---

## 3. Frontend — Three.js Isometric View

### 3.1 Visual Style

**Monument Valley meets Townscaper.** The aesthetic is:

- Orthographic projection (no perspective distortion) — this is the single most important visual decision
- Geometric architecture built from primitive shapes: extruded boxes, cylinders, cones, arches, domes
- Flat or soft-shaded materials (MeshToonMaterial or MeshLambertMaterial with low-poly geometry)
- Warm, muted colour palette — sandstone, soft terracotta, sage green, dusty blue, parchment cream
- One strong directional light casting clean geometric shadows
- Subtle ambient light to prevent harsh black shadows
- Clean, anti-aliased rendering

**What it is NOT:** pixel art, photorealistic, neon/cyberpunk, dark-themed. It should feel like a calm, beautiful miniature world.

### 3.2 Camera Setup

```javascript
// Orthographic camera at classic isometric angle
const camera = new THREE.OrthographicCamera(...)
// Rotation: 45° around Y axis, ~35.264° down (true isometric)
// Position camera looking down at the scene centre
// No user camera control in V0 — fixed angle, scrollable via mouse drag to pan
```

The camera should be pannable (click-drag to scroll the map) but not rotatable or zoomable in V0. The view should initialise centred on the town.

### 3.3 Terrain Generation

The map is procedurally generated each time the app starts. It does NOT persist between sessions.

**Grid system:** The world is a grid of tiles (e.g. 20×20). Each tile is a flat square or slightly varied-height block. Terrain types:

- **Grass** — default, flat, sage/green tones with slight colour variation per tile
- **Water** — a few tiles forming a river or pond (flat blue plane with subtle animation)
- **Hills** — raised tiles at the map edges, taller boxes with earthy tones
- **Paths** — lighter-coloured flat tiles connecting gathering points

Terrain is generated once on load using a simple noise function or random placement rules. Buildings (gathering points) are placed on grass tiles away from water, with paths connecting them to the town centre.

### 3.4 Buildings — Gathering Points

Each unique working directory (group) spawns a **gathering point** on the map — a building structure with a small clear area around it where villager-units cluster.

Buildings are procedurally assembled from geometric primitives. Each building is a function that returns a `THREE.Group`:

| Building Type | Visual Description | Primitives |
|--------------|-------------------|------------|
| **Forge** | Squat stone building with a chimney, orange glow | Boxes + cylinder chimney + point light |
| **Library** | Tall narrow tower with arched windows, dome top | Tall box + dome (sphere half) + arch cutouts |
| **Mine Entrance** | Rocky archway into a hillside, cart tracks | Arch shape + boxes for rock + thin cylinders for rails |
| **Fishing Dock** | Wooden platform extending over water | Flat boxes + thin cylinder posts |
| **Farm** | Low walls enclosing crop rows | Low boxes + small green boxes for crops |
| **Lumber Camp** | Open-sided shelter with log pile | Box roof on cylinder posts + stacked cylinders |
| **Chapel** | Small building with a spire | Box base + cone spire |
| **Observatory** | Round tower with domed top, telescope | Cylinder + half-sphere + thin cylinder telescope |
| **Workshop** | Open workspace with benches and tools | Low boxes for benches + small scattered objects |
| **Market** | Covered stalls with coloured awnings | Thin box roofs on posts, varied colours |

When a new group appears (new working directory detected), a random building type is assigned and placed on an available grass tile. When a group disappears (all its sessions are gone), the building remains but fades/dims (abandoned ruin).

A label floats above each building showing the group name (the working directory basename, e.g. "isaval-erp"). Use an HTML overlay div positioned via CSS 3D transform or `THREE.CSS2DRenderer` for crisp text.

### 3.5 Units — Villagers

Each Claude session is one villager-unit. Units are simple geometric characters:

**Base character mesh:**
- Body: a rounded box or capsule shape (~0.4 units tall), softly coloured
- Head: a small sphere on top (~0.15 radius)
- Colour based on state (see below)

**Personality accessories** (one per unit, randomly assigned at spawn — this is where the GR flavour and charm lives):
- Tiny floating laptop (small flat box hovering near hands)
- Glowing crystal staff (thin cylinder with emissive sphere on top)
- Miniature chart/scroll (small flat plane with texture or colour stripes)
- Stack of books (2–3 tiny boxes balanced on head)
- Magnifying glass (torus + thin cylinder)
- Flask/beaker (small cone shape with coloured emissive liquid glow)

These accessories are cosmetic only — they don't map to function. They exist to make each villager feel individual and charming.

### 3.6 Unit Activities — The AoE Metaphor

Each gathering point (building) is randomly assigned an **activity pair**: one energetic animation for active units, one passive animation for idle/awaiting units.

| Activity | Animation | For State |
|----------|-----------|-----------|
| **Building** | Repeated arm-raise motion (hammering), sparks particle (optional V0+) | Active |
| **Mining** | Pickaxe swing motion (body rocks forward/back cyclically) | Active |
| **Chopping Wood** | Side-to-side rocking motion (axe swing) | Active |
| **Smelting** | Unit faces a furnace building, body pulses orange-ish emissive | Active |
| **Fishing** | Unit at water edge, gentle cast-and-reel arm motion | Active |
| **Foraging** | Slow wander in small radius, occasional bend-down | Passive |
| **Scribing** | Unit stationary, small bobbing motion (writing) | Passive |
| **Praying** | Unit kneeling (scaled Y), subtle glow pulse | Passive |
| **Resting** | Unit near a campfire point light, very slow idle bob | Passive |
| **Patrolling** | Slow walking loop around building perimeter | Passive |

**Animation implementation:** These are NOT skeletal animations or sprite swaps. They are simple transform tweens on the character mesh and its parts:
- Bobbing: sinusoidal Y-offset, period ~2 seconds
- Rocking: sinusoidal Z-rotation, period ~1.5 seconds
- Walking: translate position along a path with bobbing
- Kneeling: scale Y to 0.7, slight forward tilt

Each animation is a function `(unit, deltaTime) => void` that modifies the mesh transforms each frame.

### 3.7 Unit State Visualisation

On top of the activity animation, each unit has state-driven visual modifiers:

| State | Visual Treatment |
|-------|-----------------|
| **`active`** | Normal colours, energetic activity animation, normal speed |
| **`awaiting`** | Pulsing yellow/gold emissive glow (sinusoidal intensity, period ~2s) — the "idle villager alarm". This is the most important visual signal. A small "!" or "?" icon floats above the unit. |
| **`idle`** | Desaturated/muted colours, passive activity animation, slow speed |
| **`stale`** | Grey/translucent material (opacity ~0.4), no animation, slumped Y-scale. Ghost unit. |

**`has_children` modifier:** When a Claude session has spawned child processes (running tests, executing code, etc.), show a small companion — a tiny secondary sphere/shape orbiting the unit. Think of it as a deployed siege weapon or summoned creature.

### 3.8 Unit Clustering and Positioning

Units belonging to the same group cluster around their gathering point building. Positioning rules:

1. Each building has 8–12 **anchor positions** arranged in a semicircle or grid around it (offset from the building centre by 1–2 tile units)
2. When a session joins a group, it's assigned the nearest unoccupied anchor position
3. Units smoothly lerp to their assigned position over ~1 second (never teleport)
4. When a session departs, remaining units can optionally shuffle to fill gaps (or just leave the gap — simpler for V0)
5. If more units than anchor positions, expand the radius

The anchor positions should have slight random jitter (±0.2 tiles) so the clustering looks organic, not grid-locked.

### 3.9 Selection and HUD

**Raycaster selection:** Clicking on a unit highlights it (add an outline, ring, or glow) and opens the **Selection Panel**. Clicking on empty space deselects. Clicking on a building selects all units in that group.

**Selection Panel** — an HTML/CSS overlay anchored to the bottom or side of the viewport:

```
┌──────────────────────────────────────────────┐
│  📜 claude-48231                    [active]  │
│                                               │
│  Project:    isaval-erp                       │
│  Directory:  /home/tomek/projects/isaval-erp  │
│  PID:        48231                            │
│  CPU:        43.2%  ████████░░  MEM: 187 MB   │
│  Uptime:     20m 47s                          │
│  Terminal:   /dev/pts/3                       │
│  Children:   Yes (subprocess running)         │
│                                               │
│  Status:     ● Active — high CPU sustained    │
└──────────────────────────────────────────────┘
```

When a building is selected (group selection), show a summary:

```
┌──────────────────────────────────────────────┐
│  🏗️ isaval-erp                   [4 units]    │
│                                               │
│  Active: 2  │  Awaiting: 1  │  Idle: 1       │
│                                               │
│  ● claude-48231  active     CPU 43%  20m      │
│  ● claude-48290  active     CPU 67%  18m      │
│  ◐ claude-49001  awaiting   CPU  1%  35m      │
│  ○ claude-49122  idle       CPU  0%  2h 10m   │
└──────────────────────────────────────────────┘
```

**Top-bar HUD** — minimal HTML overlay across the top:

```
Age of the Crystal Ball    │  Sessions: 12  │  Active: 5  │  Awaiting: 3  │  Idle: 2  │  Stale: 2
```

This is always visible. The "Awaiting" count should pulse or highlight when > 0 — it's your idle villager alarm at the global level.

### 3.10 Map Labels

Each building/gathering point has a floating label above it showing the group name (directory basename). Use `THREE.CSS2DRenderer` layered on top of the WebGL canvas for crisp, always-readable text. Labels should have a subtle background pill/rounded-rect for legibility against varying terrain.

---

## 4. Project Structure

```
crystal-ball/
├── package.json
├── README.md
├── server/
│   ├── index.js              # Express app — serves static + API
│   ├── discovery/
│   │   ├── index.js           # SessionDiscovery interface + platform selection
│   │   ├── macos.js           # macOS process discovery (ps + lsof)
│   │   ├── linux.js           # Linux process discovery (/proc)
│   │   └── simulator.js       # Fake session generator for dev/demo
│   ├── classifier.js          # State heuristic engine (raw stats → state enum)
│   └── sessionStore.js        # In-memory store, groups sessions, tracks history
├── public/
│   ├── index.html             # Single page — loads Three.js from CDN
│   ├── css/
│   │   └── style.css          # HUD, selection panel, labels, overlays
│   ├── js/
│   │   ├── main.js            # Entry point — init scene, start poll loop
│   │   ├── scene.js           # Three.js scene setup — camera, lights, renderer
│   │   ├── terrain.js         # Procedural terrain generation
│   │   ├── buildings.js       # Building mesh constructors (one per type)
│   │   ├── units.js           # Unit mesh constructor + accessory system
│   │   ├── animations.js      # Animation functions (bobbing, rocking, walking, etc.)
│   │   ├── activities.js      # Activity palette — maps activity names to animations
│   │   ├── stateVisuals.js    # State-driven visual modifiers (glow, fade, colour)
│   │   ├── worldManager.js    # Manages gathering points, unit placement, clustering
│   │   ├── selection.js       # Raycaster, click handling, highlight system
│   │   ├── hud.js             # Top bar HUD updates
│   │   ├── selectionPanel.js  # Selection panel DOM generation and updates
│   │   └── api.js             # Fetch /api/sessions, diff detection
│   └── lib/                   # (optional) local copies of CDN libs for offline use
└── tests/
    ├── server/
    │   ├── classifier.test.js     # State heuristic unit tests
    │   ├── simulator.test.js      # Simulator output validation
    │   ├── sessionStore.test.js   # Grouping and history tracking tests
    │   └── api.test.js            # API response shape tests
    └── client/
        ├── worldManager.test.js   # Clustering and placement logic tests
        └── activities.test.js     # Activity assignment tests
```

---

## 5. Startup and Usage

```bash
# Install
cd crystal-ball
npm install

# Run with real Claude session discovery
npm start
# → Server listening on http://localhost:3000

# Run in simulation mode (no real sessions needed)
npm run simulate
# or
SIMULATE=true npm start

# Run tests
npm test
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3000` | Server port |
| `--simulate` | `false` | Use fake session data |
| `--poll-interval` | `2000` | Polling interval in ms |

---

## 6. Detailed Implementation Notes

### 6.1 Three.js Setup

```javascript
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

// Orthographic camera — true isometric angle
const aspect = window.innerWidth / window.innerHeight;
const viewSize = 14; // how much of the world is visible
const camera = new THREE.OrthographicCamera(
  -viewSize * aspect / 2, viewSize * aspect / 2,
  viewSize / 2, -viewSize / 2,
  0.1, 100
);

// Classic isometric rotation
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xE8E0D4); // warm parchment background

// CSS2D for labels
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

// Lighting
const dirLight = new THREE.DirectionalLight(0xFFF5E6, 1.2);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
const ambLight = new THREE.AmbientLight(0x8899AA, 0.4);
```

### 6.2 Colour Palette

Define as constants and reuse everywhere:

```javascript
const PALETTE = {
  // Terrain
  grass:       0x8BA888,  // sage green
  grassAlt:    0x97B594,  // lighter variation
  water:       0x6B9DAD,  // dusty blue
  path:        0xD4C9B0,  // sandy path
  dirt:        0xA8956E,  // earthy brown
  hill:        0x7A8B6E,  // darker green-brown

  // Buildings
  sandstone:   0xD4B896,  // warm sandstone
  stone:       0xA09888,  // cool grey stone
  wood:        0x8B6F4E,  // warm wood
  roof:        0xB85C3A,  // terracotta roof
  roofAlt:     0x5B7A6E,  // green copper roof

  // Units
  unitBody:    0xC4A882,  // warm neutral
  unitHead:    0xE8D5C0,  // lighter skin tone
  unitActive:  0x7EBF8A,  // green tint for active
  unitAwait:   0xE8C84A,  // gold for awaiting
  unitIdle:    0x9E9E9E,  // grey for idle
  unitStale:   0x6E6E6E,  // dark grey, transparent

  // Accents
  crystalGlow: 0xA07EDC,  // purple crystal
  fireGlow:    0xE8843A,  // forge fire
  lampGlow:    0xFFE4A0,  // warm lamp light

  // UI
  background:  0xE8E0D4,  // warm parchment bg
  panelBg:     '#1a1a2e', // dark panel
  panelText:   '#e8e0d4', // light text on dark panel
  panelAccent: '#e8c84a', // gold accent
};
```

### 6.3 Character Mesh Construction

Important: `THREE.CapsuleGeometry` is NOT available in Three.js r128. Use alternatives.

```javascript
function createUnit(sessionData) {
  const group = new THREE.Group();

  // Body — rounded cylinder approximation
  const bodyGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.4, 8);
  const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.unitBody });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.25;
  body.castShadow = true;
  group.add(body);

  // Head — sphere
  const headGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const headMat = new THREE.MeshLambertMaterial({ color: PALETTE.unitHead });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.55;
  head.castShadow = true;
  group.add(head);

  // Accessory (randomly chosen)
  const accessory = createRandomAccessory();
  group.add(accessory);

  // Store metadata on the group for raycaster identification
  group.userData = { type: 'unit', sessionId: sessionData.id };

  return group;
}
```

### 6.4 Animation System

The animation loop runs in `requestAnimationFrame`. Each animated entity registers an update function:

```javascript
const animatedEntities = [];

function animate(time) {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  for (const entity of animatedEntities) {
    entity.update(time, delta);
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
```

Animation functions are pure — they take (mesh, time, delta) and mutate transforms:

```javascript
// Idle bob — gentle sinusoidal Y-offset
function animBob(mesh, time, amplitude = 0.05, speed = 2) {
  mesh.position.y = mesh.userData.baseY + Math.sin(time * speed) * amplitude;
}

// Work rock — forward/back tilt
function animRock(mesh, time, angle = 0.15, speed = 3) {
  mesh.rotation.x = Math.sin(time * speed) * angle;
}

// Awaiting pulse — emissive glow oscillation
function animPulse(mesh, time, color = 0xE8C84A, speed = 2) {
  const intensity = (Math.sin(time * speed) + 1) / 2; // 0 to 1
  mesh.material.emissive.setHex(color);
  mesh.material.emissiveIntensity = intensity * 0.5;
}

// Walk — move along circular path
function animPatrol(mesh, time, radius = 1.5, speed = 0.5) {
  mesh.position.x = mesh.userData.baseX + Math.cos(time * speed) * radius;
  mesh.position.z = mesh.userData.baseZ + Math.sin(time * speed) * radius;
  mesh.rotation.y = time * speed + Math.PI; // face direction of movement
}

// Lerp position — smooth movement to target
function lerpToTarget(mesh, target, delta, speed = 3) {
  mesh.position.lerp(target, 1 - Math.exp(-speed * delta));
}
```

### 6.5 World Manager — The Core Orchestrator

The world manager is the most important piece of frontend logic. It:

1. Receives session data from the API poller
2. Diffs against current scene state
3. Spawns new buildings for new groups
4. Spawns/removes units for new/departed sessions
5. Updates unit states and triggers animation changes
6. Manages the spatial layout

```javascript
class WorldManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.buildings = new Map();  // groupId → { mesh, type, position, anchors }
    this.units = new Map();      // sessionId → { mesh, animation, state }
    this.buildingTypes = [...]; // shuffled list for assignment
  }

  update(apiData) {
    // 1. Handle new groups → spawn buildings
    // 2. Handle departed groups → fade buildings
    // 3. Handle new sessions → spawn units, assign to anchors
    // 4. Handle departed sessions → remove units
    // 5. Handle state changes → update visuals and animations
  }
}
```

### 6.6 Selection System

```javascript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(scene.children, true);
  // Walk up parent chain to find group with userData.type === 'unit' or 'building'
  // Highlight selected, deselect previous, update panel
});
```

### 6.7 Camera Panning

Mouse drag to pan the orthographic camera:

```javascript
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  // Convert screen-space delta to world-space camera movement
  // Account for isometric angle
  camera.position.x -= (dx * 0.02);
  camera.position.z -= (dy * 0.02);
  camera.updateProjectionMatrix();
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mouseup', () => { isDragging = false; });
```

---

## 7. Simulation Engine — Detailed Specification

The simulator (`server/discovery/simulator.js`) must produce realistic, time-varying data that exercises all visual states and transitions. It is the primary development and testing tool.

### 7.1 Simulated Projects

Generate 3–5 groups with realistic names:

```javascript
const SIMULATED_GROUPS = [
  { name: "isaval-erp", cwd: "/home/tomek/projects/isaval-erp", sessionCount: 4 },
  { name: "foundation-docs", cwd: "/home/tomek/projects/foundation-docs", sessionCount: 2 },
  { name: "fleet-analysis", cwd: "/home/tomek/projects/fleet-analysis", sessionCount: 1 },
  { name: "competitor-intel", cwd: "/home/tomek/projects/competitor-intel", sessionCount: 3 },
  { name: "hr-automation", cwd: "/home/tomek/projects/hr-automation", sessionCount: 2 },
];
```

### 7.2 Dynamic Behaviour

Sessions should exhibit realistic lifecycle behaviour over time:

- **CPU curves:** Smooth sine waves with occasional spikes, not random noise. Active sessions oscillate between 20–80%. Idle sessions stay near 0%.
- **State transitions:** Sessions should occasionally transition between states (e.g. active → awaiting → active cycle every few minutes). Roughly every 30–60 seconds, one session should change state.
- **Session churn:** Every 2–3 minutes, one session should "depart" (removed from list) and a new one should "spawn" (added with fresh PID and low age). This tests the spawn/remove animations.
- **Child process toggling:** Active sessions should occasionally toggle `has_children` on/off to simulate running and completing subprocesses.

### 7.3 Session Ages

Simulated ages should be pre-set to a spread: some sessions young (< 5 minutes), some mid (10–60 minutes), some old (1–3 hours), and one or two stale (> 1 hour detached).

---

## 8. HUD and Selection Panel — HTML/CSS Specification

### 8.1 Typography

Use a distinctive font pairing loaded from Google Fonts:

- **Display / headings:** `"Cinzel"` — elegant, medieval-inspired serif. Used for the title bar and building names.
- **Body / data:** `"JetBrains Mono"` or `"IBM Plex Mono"` — clean monospace for stats and session data.

### 8.2 Panel Styling

The selection panel and HUD should feel like a game UI overlay — semi-transparent dark background, crisp text, coloured status indicators. Think AoE2's bottom panel but with a modern, clean treatment.

```css
.selection-panel {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 35, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(232, 200, 74, 0.3);
  border-radius: 8px;
  padding: 16px 24px;
  color: #e8e0d4;
  font-family: 'IBM Plex Mono', monospace;
  min-width: 400px;
  max-width: 600px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
}

.hud-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  background: rgba(20, 20, 35, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(232, 200, 74, 0.2);
  display: flex;
  align-items: center;
  padding: 0 24px;
  font-family: 'Cinzel', serif;
  color: #e8e0d4;
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.state-dot.active { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
.state-dot.awaiting { background: #e8c84a; box-shadow: 0 0 6px #e8c84a; animation: pulse 2s infinite; }
.state-dot.idle { background: #9e9e9e; }
.state-dot.stale { background: #6e6e6e; }
```

### 8.3 Awaiting Input Alert

When any session is in `awaiting` state, the HUD count should pulse with a gold glow animation. This is the "idle villager alarm" — the single most important notification in the system.

---

## 9. Testing Strategy

### 9.1 Server Tests (Node.js — use built-in `node:test` or Jest)

**classifier.test.js — State heuristic engine:**
- Given CPU > 10% sustained → returns `active`
- Given CPU < 5%, TTY attached, quiet 10–60s → returns `awaiting`
- Given CPU < 5%, quiet > 10 min → returns `idle`
- Given TTY detached → returns `stale`
- Given CPU spike after idle period → transitions back to `active`
- Edge cases: CPU exactly at thresholds, TTY changes mid-session

**sessionStore.test.js — Grouping logic:**
- Sessions with same `cwd` are grouped together
- Group ID is `cwd` basename
- Sessions correctly added/removed from groups
- Empty groups retained (building stays) vs cleaned up (configurable)

**simulator.test.js — Simulator output:**
- Output matches session schema (all required fields present, correct types)
- State distribution is roughly as expected (not all sessions in same state)
- CPU values are within valid ranges
- `has_children` is boolean
- Calling multiple times produces different data (not deterministic)

**api.test.js — HTTP endpoint:**
- `GET /api/sessions` returns 200 with valid JSON
- Response matches schema shape
- Groups array is consistent with sessions array
- Timestamp is recent

### 9.2 Client Tests (can run in Node with mocked DOM, or in-browser)

**worldManager.test.js — Core orchestration logic (extract pure logic, test without Three.js):**
- New group in data → building creation triggered
- New session → unit creation triggered
- Session removed → unit removal triggered
- State change → visual update triggered
- Group with multiple sessions → correct anchor assignment
- All sessions leave group → building marked abandoned, not removed

**activities.test.js:**
- Each activity has both energetic and passive variants
- Activity assignment is deterministic per group (same group always gets same activity)
- All animation functions are callable and don't throw

---

## 10. Deferred to V1+ ("Age II Features")

Do NOT implement any of these in V0. They are recorded here so they can be ignored with a clear conscience:

- **Level 1 context files** — `.crystal-ball.json` sidecar files for richer session metadata
- **Command dispatch** — sending input back to Claude sessions from the UI
- **Sound design** — ambient sounds, activity sounds, alerts
- **Multiplayer / shared views** — multiple browsers viewing the same town
- **Persistence** — map state saved between reloads
- **History / timeline** — replay of session activity over time
- **Zoom / rotate camera** — only pan in V0
- **Civilisations** — themed unit/building skins (GR, Isaval, etc.)
- **Post-processing** — bloom, SSAO, depth of field
- **Particle effects** — sparks, smoke, dust
- **Water shaders** — animated water surfaces
- **Day/night cycle**
- **Authentication**
- **Claude API integration** — reading Claude's actual output or tool usage
- **MCP integration** — structured context from running sessions
- **Minimap**
- **Keyboard shortcuts**
- **Mobile support**

---

## 11. Success Criteria for V0

The MVP is complete when:

1. `npm start` launches a server on localhost
2. `npm run simulate` shows a living town with 6–12 simulated sessions
3. The isometric view renders procedural terrain with buildings and animated units
4. Units visibly cluster around their group's building
5. All four states (active, awaiting, idle, stale) are visually distinguishable at a glance
6. Clicking a unit shows its session details in the selection panel
7. Clicking a building shows the group summary
8. The HUD bar shows aggregate counts with an "awaiting" pulse alert
9. The scene feels alive — units bob, work, glow, and animate even when nothing changes
10. On macOS with real Claude Code sessions running, the app discovers and displays them correctly
11. All server-side tests pass

The most important criterion: **someone glancing at the screen should immediately understand which sessions need attention and which are fine, without reading any text.**

---

## 12. Dependencies

### Server (package.json)
```json
{
  "name": "crystal-ball",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "simulate": "SIMULATE=true node server/index.js",
    "test": "node --test tests/**/*.test.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  },
  "devDependencies": {}
}
```

### Browser (CDN — no npm)
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
```

Three.js r160 is recommended (stable, well-documented, has CSS2DRenderer). Do NOT use r128 — it lacks several features used in this spec. Note: CapsuleGeometry is available from r142+, so it CAN be used with r160 if desired, but CylinderGeometry approximations are fine for V0.

---

## Appendix A: Quick-Reference Lookup Tables

### State → Visual

| State | Body Colour | Emissive | Animation Speed | Opacity | Extra |
|-------|------------|----------|----------------|---------|-------|
| active | Normal | None | 1.0x | 1.0 | — |
| awaiting | Normal | Gold pulse | 0.5x | 1.0 | Floating "!" icon |
| idle | Desaturated | None | 0.5x | 0.8 | — |
| stale | Grey | None | 0x (frozen) | 0.4 | — |

### Activity Pair Assignments (shuffled per building)

| # | Energetic (active) | Passive (idle/awaiting) |
|---|-------------------|----------------------|
| 1 | Building (hammering) | Scribing (writing) |
| 2 | Mining (pickaxe) | Praying (kneeling) |
| 3 | Chopping (axe swing) | Resting (campfire) |
| 4 | Smelting (furnace) | Foraging (wandering) |
| 5 | Fishing (casting) | Patrolling (walking loop) |
