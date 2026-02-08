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

### District Auto-Inference (#26)
- Group neighborhoods by nearest common ancestor directory
- Example: /home/tomek/projects/SimExLab + /home/tomek/projects/FPA-328 -> District "projects"
- Districts affect map placement (same-district neighborhoods cluster in same biome zone)
- Taller district banner marks each zone
- API gains divisions array: [{ id, commonPath, groupIds }]
- **Effort:** Medium. **Impact:** Medium.
- **Files:** server/sessionStore.js (grouping logic), server/index.js (API response)

### Dynamic Formations (#27)
- Villager arrangement around buildings responds to neighborhood state composition:
  - Busy formation (majority active): tight rows, facing outward
  - Rest formation (majority idle/awaiting): loose scatter, wider radius
  - Camp formation (majority stale): cluster around auto-spawned campfire
- Formation transitions: villagers lerp to new anchors over 2s
- **Effort:** Medium. **Impact:** Medium.
- **Files:** public/js/worldManager.js (anchor generation strategies)

### Hook Phase Inference Gaps (#28)
- Write/Edit on `.md` files currently inferred as `coding`, could be `reviewing` (since documenting was folded into reviewing). Hook would need to inspect `file_path` extension.
- Re-runs of recently failed test commands currently fall to default `coding`, could be `testing`. Hard in a stateless hook (would need to remember last test command).
- No hook event maps to a `debugging` phase (now folded into `coding`, so moot unless we want sub-phase granularity later).
- **Effort:** Low-medium. **Impact:** Low.
- **Files:** hooks/crystal-ball-hook.sh

---

## Tier 2: Stretch Goals (from V1 design)

### Path A* (#33)
- Villagers path-find around buildings and water instead of lerping directly to anchors
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
- Small particle burst when villager changes role (e.g. Intern->Researcher at 2min)
- Classification change already detected in update loop, just needs particle spawn
- **Effort:** Low. **Impact:** Low.

### Linux Process Discovery (#37)
- /proc filesystem scanning for Claude processes
- readlink /proc/PID/cwd, /proc/PID/stat for CPU/mem
- Conditional: only needed if deploying on Linux
- **Effort:** Medium. **Impact:** Conditional.

---

## Tier 3: Multi-Person View -- COMPLETE

Implemented. Relay server at `crystal-ball-relay/`, local daemon relay modules at `server/relay/`, frontend panels (roster, sharing).

**Demo:** Run `npm run demo:relay`, `npm run demo:local`, `npm run demo:bot` in three terminals. Open `localhost:3000`.

---

## Tier 3.5: Process Management

### Kill / Restart Sessions from UI (#38)
- Right-click or selection panel action to kill a Claude process directly from the Crystal Ball
- Useful for cleaning up orphaned/zombie sessions the user didn't know about (discovered organically -- the UI revealed a 14-day orphaned process!)
- Selection panel button: "Kill Session" with confirmation dialog
- Backend: POST /api/sessions/:id/kill sends SIGTERM (then SIGKILL after timeout)
- Safety: require double-confirm for active (non-stale) sessions
- Stretch: "Kill All Stale" bulk action in Trading Floor
- **Effort:** Low-medium. **Impact:** High (operational utility beyond visualization).
- **Files:** server/index.js (kill endpoint), public/js/selectionPanel.js (kill button), public/js/warroom.js (bulk action)

### Focus Terminal from UI (#39)
- Click a unit (or button in selection panel) to focus the actual terminal window running that session
- TTY device already captured by macOS discovery (`session.tty`)
- **macOS options:**
  - **iTerm2 (best):** AppleScript API exposes `tty` per session -- iterate windows/tabs, match TTY, `activate`. Reliable, no fuzzy matching.
  - **Terminal.app:** AppleScript can focus windows but doesn't expose TTY -- would need indirect matching via window title or process tree. Fragile.
  - **VS Code:** No external API to focus a specific integrated terminal panel. Not feasible without an extension.
  - All approaches require macOS Accessibility permissions (one-time user grant).
- **Linux options:**
  - `xdotool` can focus windows by PID on X11. Walk `/proc/PID/stat` -> session leader -> terminal emulator PID -> `xdotool windowactivate`.
  - Wayland: no universal window-focus protocol yet; compositor-specific (sway IPC, KDE scripting). Harder.
  - `wmctrl` is another X11 option for window activation by PID.
- **Implementation sketch:** server-side `terminalMap` module polls AppleScript/xdotool every few seconds to build `tty -> windowId` cache. New POST `/api/sessions/:id/focus` endpoint triggers activation. Client adds button to selection panel.
- **Effort:** Medium. **Impact:** High (bridges visualization back to real workflow).
- **Files:** NEW server/discovery/terminalMap.js, server/index.js (endpoint), public/js/selectionPanel.js (focus button)

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

### Sparkline in Trading Floor
- CPU sparkline charts per neighborhood in the Trading Floor panel
- Client-side rolling history buffer
- **Effort:** Medium.
