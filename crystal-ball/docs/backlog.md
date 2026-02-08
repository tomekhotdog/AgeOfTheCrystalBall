# Backlog -- Age of the Crystal Ball

Everything remaining. Consolidated from the V1 design doc, V1 addendum, and future visual improvements notes. Organized by priority tier.

---

## Tier 1: Should-Have (from V1 design, not yet done)

### Sparkline CPU History (#20)
- Small inline sparkline chart in selection panel showing CPU over last 2 minutes
- Width 120px, height 24px, SVG polyline
- Data: last 60 readings at 2s intervals
- Line color: green/gold/grey by state, 20% opacity fill
- Backend: sessionStore tracks cpuHistory array per PID (last 60 readings), included in API response as cpu_history: number[]
- **Effort:** Medium. **Impact:** Medium.
- **Files:** server/sessionStore.js (history buffer), public/js/selectionPanel.js (sparkline render)

### Sound Design (#21)
- Ambient loop (birds, wind, distant anvil)
- Idle chime (session -> awaiting): soft bell
- Spawn horn (new unit): short horn note
- Death tone (unit removed): low fading tone
- Victory fanfare: brief medieval flourish
- Click sound: soft tap
- All from /public/audio/, SoundManager class, Web Audio API
- Muted by default. Speaker icon in HUD to toggle.
- **Effort:** High (requires audio asset sourcing). **Impact:** High.
- **Files:** NEW public/js/sound.js, public/audio/*.mp3

### Division Auto-Inference (#26)
- Group platoons by nearest common ancestor directory
- Example: /home/tomek/projects/SimExLab + /home/tomek/projects/FPA-328 -> Division "projects"
- Divisions affect map placement (same-division platoons cluster in same biome zone)
- Taller division banner marks each zone
- API gains divisions array: [{ id, commonPath, groupIds }]
- **Effort:** Medium. **Impact:** Medium.
- **Files:** server/sessionStore.js (grouping logic), server/index.js (API response)

### Dynamic Formations (#27)
- Unit arrangement around buildings responds to platoon state composition:
  - Battle formation (majority active): tight rows, facing outward
  - Rest formation (majority idle/awaiting): loose scatter, wider radius
  - Camp formation (majority stale): cluster around auto-spawned campfire
- Formation transitions: units lerp to new anchors over 2s
- **Effort:** Medium. **Impact:** Medium.
- **Files:** public/js/worldManager.js (anchor generation strategies)

---

## Tier 2: Stretch Goals (from V1 design)

### Path A* (#33)
- Units path-find around buildings and water instead of lerping directly to anchors
- Requires navigation grid on tile system, A* algorithm, path-following animation
- **Effort:** High. **Impact:** Medium.

### Stars at Night (#34)
- Starfield during night phase of day/night cycle
- Particle system on large sphere, or background shader
- Fade in/out with phase transitions
- **Effort:** Low-medium. **Impact:** Low.

### Tilt-Shift Depth of Field (#35)
- Post-processing pass blurring objects far from focal plane
- Miniature/diorama look. BokehPass in Three.js.
- **Effort:** Medium. **Impact:** Low.

### Class Transition Particle Puff (#36)
- Small particle burst when unit changes class (e.g. Intern->Researcher at 2min)
- Classification change already detected in update loop, just needs particle spawn
- **Effort:** Low. **Impact:** Low.

### Linux Process Discovery (#37)
- /proc filesystem scanning for Claude processes
- readlink /proc/PID/cwd, /proc/PID/stat for CPU/mem
- Conditional: only needed if deploying on Linux
- **Effort:** Medium. **Impact:** Conditional.

---

## Tier 3: Multi-Person View (from V1 addendum, not started)

A separate feature set that enables multiple users to share session state via a central relay server.

### Architecture
```
[User A machine]          [User B machine]
  Local daemon              Local daemon
  +-- Relay client --+ +-- Relay client
                      v v
              [Central Relay Server]
              +-- Combined state API
```

### Relay Server (new project: crystal-ball-relay/)
- Separate Node.js + Express process
- Accepts session snapshots from local daemons via POST /api/publish
- Stores latest snapshot per user in memory (ephemeral)
- Serves combined/filtered views via GET /api/combined
- Expires snapshots after 30s (user offline)
- GET /api/users for online user list
- Simple shared-token auth for publish (--token flag)
- CLI flags: --port (3001), --token, --expiry (30000ms)

### Local Daemon Changes
- Publisher: POST snapshots to relay every poll cycle (if --share enabled)
- Subscriber: GET combined data from relay
- New CLI flags: --relay-url, --user-name, --user-color, --share, --include-users
- New API endpoint: GET /api/combined (proxied from relay)
- New API endpoint: GET /api/mode -> { mode: "local"|"multi", user, relay }
- Browser checks /api/mode on startup, switches polling target

### Frontend: Multi-Person
- Player colors: unit banners/flags in player color (tiny plane mesh)
- Player roster panel: collapsible list of online users with session counts, filter by click
- Building labels: per-user colored dots showing who has sessions there
- Selection panel: shows user name + color for each unit
- HUD: user count, blocked counter
- Session IDs namespaced as {user}/{local_id} to avoid collisions

### Group Merging
- Groups merged by directory basename across users
- Same basename = same building (even from different machines)
- Known limitation: false merges for common names like "utils"

### Multi-Person Simulation
- When --simulate + --relay-url=simulated: generate 2-3 fake users
- Each with 2-5 sessions, mix of Mode 1/Mode 2
- Tests mixed multi-person visualization without real remote users

### Files
New project: crystal-ball-relay/ (server/index.js, store.js, merger.js, auth.js + tests)
Local additions: server/relay/publisher.js, server/relay/subscriber.js, public/js/playerColors.js, public/js/roster.js
Modifications: worldManager.js, units.js, stateVisuals.js, selectionPanel.js, hud.js, api.js

---

## Tier 4: Visual Polish (deferred improvements)

### PBR Materials
- MeshLambertMaterial -> MeshStandardMaterial for roughness/metalness
- Metallic hammer heads, stone walls with roughness, glossy crystal orbs
- Would shift art direction from flat Monument Valley toward more realistic look
- **Effort:** High. **Files:** units.js, buildings.js, terrain.js, townhall.js

### 3D Text Labels
- Replace CSS2DRenderer labels with THREE.TextGeometry or SDF text
- Proper depth occlusion, perspective scaling
- **Effort:** Very high. Requires font loading, text atlas, instancing.

### Shadow Map 4096
- 2048 -> 4096 shadow map resolution
- Eliminates soft-edge artifacts, costs 4x VRAM (~64MB)
- Only worth it on dedicated GPUs
- **Effort:** Low. **Impact:** Low.

### Sparkline in War Room
- CPU sparkline charts per platoon in the War Room panel
- Client-side rolling history buffer
- **Effort:** Medium.
