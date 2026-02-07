# Future Visual Improvements

Potential upgrades that were identified but deferred due to complexity or
high performance cost. Revisit when there is spare frame budget or for a
dedicated polish pass.

## 1. PBR Materials (MeshLambertMaterial -> MeshStandardMaterial)

Every unit, building, terrain tile, and accessory currently uses
`MeshLambertMaterial` (simple diffuse, no specular). Switching to
`MeshStandardMaterial` adds roughness and metalness, giving surfaces a
more physically grounded look (e.g. metallic hammer heads, stone walls
with roughness, glossy crystal orbs).

**Effort:** High. Every material creation site needs roughness/metalness
tuning. The art direction would shift from flat-shaded Monument Valley
toward a more realistic PBR look, which may or may not be desirable.

**Files:** `units.js`, `buildings.js`, `terrain.js`, `townhall.js`,
`marchIn.js` (gravestones already use Standard).

## 2. 3D Text Labels (replace CSS2DRenderer)

Building labels and await "!" markers currently use CSS2DObjects (DOM
elements overlaid on the WebGL canvas). They don't participate in depth
testing, so they render on top of everything and can't be occluded by
geometry.

Replacing them with `THREE.TextGeometry` or SDF-based 3D text would
integrate labels into the 3D scene with proper occlusion and perspective
scaling.

**Effort:** Very high. Requires font loading (Troika-three-text or
THREE.FontLoader), text atlas management, and would increase draw calls
significantly unless instanced.

## 3. Shadow Map 4096

Shadow map is currently 2048x2048. Going to 4096 would eliminate the
remaining soft-edge artifacts at the cost of 4x VRAM for the shadow
buffer (~64MB). Only worth it on dedicated GPUs.

## 4. Tilt-Shift / Depth of Field

A post-processing pass that blurs objects far from a focal plane, giving
a miniature/diorama look that suits the isometric art style. Three.js
has `BokehPass` for this.

**Effort:** Medium. Adding the pass is straightforward, but tuning focal
distance and blur radius to match the isometric camera requires
iteration. Performance cost is one additional full-screen pass.

## 5. Stars at Night

During the night phase of the day/night cycle, render a starfield in the
background. Could be a particle system on a large sphere, or a simple
shader on the scene background.

**Effort:** Low-medium. The day/night cycle already exists; stars would
need to fade in/out with the phase transitions.

## 6. Path A* / Unit Pathfinding

Units currently lerp directly to their anchor positions. Adding A*
pathfinding around buildings and water would make movement look more
natural, with units walking along paths and around obstacles.

**Effort:** High. Requires a navigation grid, pathfinding algorithm, and
path-following animation system.

## 7. Class Transition Particle Puff

When a unit changes class (e.g. Scout -> Scholar as it ages past 120s),
spawn a small particle burst to draw attention to the transition.

**Effort:** Low. The classification change is already detected in the
update loop; just needs a particle spawn call at the right moment.

## 8. Dynamic Formations

Units around a building could arrange themselves in military-style
formations (wedge, line, square) rather than the current circular
anchor layout. Formation type could be based on the dominant class
in the group.

**Effort:** Medium. Requires new anchor generation strategies and
smooth transitions when formations change.

## 9. Sparkline CPU History

Show a small inline sparkline chart in the selection panel or war room
showing each session's CPU usage over time. Requires storing a rolling
history buffer of CPU readings on the client side.

**Effort:** Medium. Canvas-based sparkline rendering + history buffer.

## 10. Sound Design

Ambient sounds (birds, wind, water), unit acknowledgement sounds on
selection, and event stingers (victory fanfare, unit death). Web Audio
API with spatial audio for positional effects.

**Effort:** High. Requires audio asset creation/sourcing, spatial audio
setup, and careful volume/mixing to avoid being annoying.
