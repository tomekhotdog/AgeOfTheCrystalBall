// terrain.js — Procedural terrain generation on a 28x28 biome-based grid.
// Features: 4 biome quadrants, a river with bridge, animated water, and
// post-build decoration placement (trees, rocks, wildflowers).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const PALETTE = {
  // Meadow biome — vibrant spring greens
  grass: 0xA8CC9A, grassAlt: 0xB8DCA8,
  wildflower1: 0xE8B8C8, wildflower2: 0xC8D8E8, wildflower3: 0xE8D8B0,
  // Forest biome — rich but readable greens
  forestGrass: 0x88AA82, forestGrassAlt: 0x749A70,
  treeTrunk: 0x8B6850, treeLeaves: 0x62A062, treeLeavesAlt: 0x559255,
  // Desert biome — warm golden tones
  sand: 0xE2D4B0, sandAlt: 0xD8C8A4, rock: 0xB8A898,
  // Mountain biome — visible stone
  mountainStone: 0x9A9898, mountainStoneAlt: 0xAAAA9E, snow: 0xF0F0F8,
  // Water — vivid clear blue
  water: 0x4AACE8, waterDeep: 0x3898D8,
  // Paths
  path: 0xDED4BC,
  // Shared
  dirt: 0xC0AA82, hill: 0x96AA86,
  sandstone: 0xE2CCA8, stone: 0xB8B0A0,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID = 28;
const HALF = GRID / 2; // 14 — grid spans -14..+13
const BIOME_LIST = ['meadow', 'forest', 'desert', 'mountain'];
const TRANSITION_WIDTH = 2; // tiles of blend at biome boundaries

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helper
// ---------------------------------------------------------------------------

export function pseudoRandom(x, z) {
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ---------------------------------------------------------------------------
// Material key — grouping predicate for geometry merging
// ---------------------------------------------------------------------------

/**
 * Produce a string key from a mesh's material and shadow properties.
 * Meshes with the same key can be merged into one draw call.
 * @param {number} colorHex
 * @param {number} emissiveHex
 * @param {number} emissiveIntensity
 * @param {boolean} castShadow
 * @param {boolean} receiveShadow
 * @returns {string}
 */
export function materialKey(colorHex, emissiveHex, emissiveIntensity, castShadow, receiveShadow) {
  return `${colorHex}|${emissiveHex}|${emissiveIntensity}|${castShadow}|${receiveShadow}`;
}

// ---------------------------------------------------------------------------
// Biome assignment — shuffle 4 biomes into 4 quadrants
// ---------------------------------------------------------------------------

/**
 * Assign biomes to quadrants using a Fisher-Yates shuffle.
 * Quadrants: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
 * (in grid-space: 0=low-gx/low-gz, 1=high-gx/low-gz, 2=low-gx/high-gz, 3=high-gx/high-gz)
 * @returns {string[]} array of 4 biome names indexed by quadrant
 */
export function assignBiomes() {
  const biomes = [...BIOME_LIST];
  // Fisher-Yates shuffle (using Math.random — different each page load)
  for (let i = biomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [biomes[i], biomes[j]] = [biomes[j], biomes[i]];
  }
  return biomes;
}

/**
 * Determine which quadrant a grid cell belongs to.
 * @param {number} gx - grid x (0..GRID-1)
 * @param {number} gz - grid z (0..GRID-1)
 * @returns {number} quadrant index 0-3
 */
export function quadrantIndex(gx, gz) {
  const halfGrid = GRID / 2;
  const col = gx < halfGrid ? 0 : 1;
  const row = gz < halfGrid ? 0 : 1;
  return row * 2 + col;
}

/**
 * Get the biome at a given grid position, accounting for transition blending.
 * In the 2-tile transition zone near quadrant boundaries, the biome is picked
 * from whichever quadrant center is closest (with some noise for organic edges).
 * @param {number} gx
 * @param {number} gz
 * @param {string[]} biomeMap - array of 4 biome names
 * @returns {string} biome name
 */
export function biomeAt(gx, gz, biomeMap) {
  const halfGrid = GRID / 2;
  const centerX = halfGrid / 2; // center of each quadrant half
  const centerZ = halfGrid / 2;

  // Distance to the quadrant boundary (horizontal and vertical center lines)
  const distToBoundaryX = Math.abs(gx - halfGrid + 0.5);
  const distToBoundaryZ = Math.abs(gz - halfGrid + 0.5);
  const minDistToBoundary = Math.min(distToBoundaryX, distToBoundaryZ);

  // If clearly inside a quadrant (outside transition zone), use direct lookup
  if (minDistToBoundary > TRANSITION_WIDTH) {
    return biomeMap[quadrantIndex(gx, gz)];
  }

  // In the transition zone, blend by picking the nearest quadrant center
  // with a small noise offset to make boundaries organic
  const noise = (pseudoRandom(gx * 3, gz * 7) - 0.5) * 1.5;
  const adjustedGx = gx + noise * 0.3;
  const adjustedGz = gz + noise * 0.3;
  return biomeMap[quadrantIndex(Math.round(adjustedGx), Math.round(adjustedGz))];
}

// ---------------------------------------------------------------------------
// River path generation
// ---------------------------------------------------------------------------

/**
 * Generate a river path from one edge of the map to another.
 * The river curves through the grid as a set of tile coordinates.
 * @returns {Set<string>} set of "gx,gz" keys for river tiles
 */
export function generateRiverPath() {
  const riverTiles = new Set();

  // River flows roughly from top-left area to bottom-right area,
  // with sinusoidal curves for a natural feel.
  const startGz = 0;
  const endGz = GRID - 1;

  // Starting X position in the left third of the map
  let cx = 4 + Math.floor(Math.random() * 4); // gx 4-7

  for (let gz = startGz; gz <= endGz; gz++) {
    // Meander: shift x using a sine wave with some pseudo-random offset
    const wave = Math.sin(gz * 0.35) * 2.5;
    const drift = gz * 0.4; // general drift toward the right
    const noise = (pseudoRandom(gz * 5, 42) - 0.5) * 1.5;
    const x = Math.round(cx + wave + drift + noise);

    // River width: 2-3 tiles
    const width = pseudoRandom(x, gz) > 0.6 ? 3 : 2;
    for (let dx = 0; dx < width; dx++) {
      const tileGx = Math.max(0, Math.min(GRID - 1, x + dx));
      riverTiles.add(`${tileGx},${gz}`);
    }
  }

  return riverTiles;
}

/**
 * Find a good location for a bridge across the river.
 * Returns the gz row and the min/max gx span of the river at that row.
 * @param {Set<string>} riverTiles
 * @returns {{ gz: number, minGx: number, maxGx: number } | null}
 */
export function findBridgeLocation(riverTiles) {
  // Pick a row near the center of the map
  const candidates = [];
  for (let gz = Math.floor(GRID * 0.35); gz < Math.floor(GRID * 0.65); gz++) {
    let minGx = GRID, maxGx = -1;
    for (let gx = 0; gx < GRID; gx++) {
      if (riverTiles.has(`${gx},${gz}`)) {
        if (gx < minGx) minGx = gx;
        if (gx > maxGx) maxGx = gx;
      }
    }
    if (maxGx >= 0) {
      candidates.push({ gz, minGx, maxGx, width: maxGx - minGx + 1 });
    }
  }

  if (candidates.length === 0) return null;

  // Prefer narrower crossings
  candidates.sort((a, b) => a.width - b.width);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Tile classification — determines type, height, and color per tile
// ---------------------------------------------------------------------------

/**
 * Classify a single tile based on its biome and position.
 * @param {number} gx - grid x
 * @param {number} gz - grid z
 * @param {string} biome - biome name at this position
 * @param {boolean} isRiver - whether this tile is part of the river
 * @returns {{ type: string, height: number, color: number, transparent?: boolean, opacity?: number }}
 */
export function classifyTile(gx, gz, biome, isRiver) {
  // River overrides biome
  if (isRiver) {
    return {
      type: 'water',
      height: 0.08,
      color: pseudoRandom(gx, gz) > 0.5 ? PALETTE.water : PALETTE.waterDeep,
      transparent: true,
      opacity: 0.78,
    };
  }

  const rng = pseudoRandom(gx, gz);

  switch (biome) {
    case 'meadow': {
      const color = rng > 0.5 ? PALETTE.grass : PALETTE.grassAlt;
      const height = 0.12 + rng * 0.06; // 0.12 - 0.18
      return { type: 'grass', height, color };
    }

    case 'forest': {
      const color = rng > 0.5 ? PALETTE.forestGrass : PALETTE.forestGrassAlt;
      const height = 0.12 + rng * 0.06;
      return { type: 'grass', height, color };
    }

    case 'desert': {
      const color = rng > 0.5 ? PALETTE.sand : PALETTE.sandAlt;
      const height = 0.10 + rng * 0.04; // 0.10 - 0.14
      return { type: 'sand', height, color };
    }

    case 'mountain': {
      // Height increases toward the map edges — dramatic peaks
      const edgeDist = Math.min(gx, gz, GRID - 1 - gx, GRID - 1 - gz);
      const edgeFactor = Math.max(0, 1 - edgeDist / 6); // 0 at center, 1 at edge
      const height = 0.25 + edgeFactor * 1.1 + rng * 0.15; // 0.25 inner to 1.5 at edge
      const color = rng > 0.5 ? PALETTE.mountainStone : PALETTE.mountainStoneAlt;
      const isOuterRing = edgeDist <= 2;
      return {
        type: isOuterRing ? 'mountain_peak' : 'mountain',
        height,
        color,
      };
    }

    default: {
      // Fallback: plain grass
      return { type: 'grass', height: 0.15, color: PALETTE.grass };
    }
  }
}

// ---------------------------------------------------------------------------
// Main terrain generation
// ---------------------------------------------------------------------------

/**
 * Generates a 28x28 biome-based terrain with a river and adds it to the scene.
 * @param {THREE.Scene} scene
 * @returns {{
 *   tiles: Map,
 *   waterTiles: Set,
 *   pathTiles: Set,
 *   getAvailableGrassTile: () => ({x: number, z: number}|null),
 *   markTileUsed: (x: number, z: number) => void,
 *   animateWater: (time: number) => void,
 *   addDecorations: (scene: THREE.Scene) => void,
 *   getBiomeAt: (x: number, z: number) => string
 * }}
 */
export function generateTerrain(scene) {
  const tiles = new Map();        // key "x,z" -> { mesh, type, height, biome }
  const waterTiles = new Set();   // keys "x,z"
  const pathTiles = new Set();
  const usedTiles = new Set();    // tiles occupied by buildings

  // Collect water meshes for animation
  const waterMeshes = [];

  // Shared ShaderMaterial for all water tiles — GPU-driven ripple animation
  const waterShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(PALETTE.water) },
      deepColor: { value: new THREE.Color(PALETTE.waterDeep) },
    },
    vertexShader: `
      uniform float time;
      varying vec3 vLocalPos;
      void main() {
        vec3 pos = position;
        float ripple = sin(time * 2.0 + pos.x * 3.0 + pos.y * 2.0) * 0.03;
        pos.z += ripple;
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 0.78);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'terrain';

  // ── Biome assignment ────────────────────────────────────────────────────
  const biomeMap = assignBiomes();

  // ── River generation ────────────────────────────────────────────────────
  const riverTileKeys = generateRiverPath();

  // ── Bridge location ─────────────────────────────────────────────────────
  const bridge = findBridgeLocation(riverTileKeys);

  // ── Build all tiles ─────────────────────────────────────────────────────
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const wx = gx - HALF; // world x
      const wz = gz - HALF; // world z

      const biome = biomeAt(gx, gz, biomeMap);
      const isRiver = riverTileKeys.has(`${gx},${gz}`);
      const info = classifyTile(gx, gz, biome, isRiver);

      let mesh;

      if (info.type === 'water') {
        // ── Water tile: PlaneGeometry with shared ShaderMaterial (GPU ripple) ──
        const planeGeom = new THREE.PlaneGeometry(1, 1, 8, 8);
        mesh = new THREE.Mesh(planeGeom, waterShaderMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(wx, info.height, wz);
        waterMeshes.push(mesh);
      } else {
        // ── Solid tile: BoxGeometry ─────────────────────────────────────
        const geom = new THREE.BoxGeometry(1, info.height, 1);
        const mat = new THREE.MeshLambertMaterial({
          color: info.color,
          transparent: info.transparent || false,
          opacity: info.opacity !== undefined ? info.opacity : 1.0,
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(wx, info.height / 2, wz);
        mesh.receiveShadow = true;

        // ── Mountain snow caps on outer ring ────────────────────────────
        if (info.type === 'mountain_peak') {
          const snowGeom = new THREE.BoxGeometry(0.8, 0.06, 0.8);
          const snowMat = new THREE.MeshLambertMaterial({ color: PALETTE.snow });
          const snowMesh = new THREE.Mesh(snowGeom, snowMat);
          snowMesh.position.set(0, info.height / 2 + 0.03, 0);
          snowMesh.receiveShadow = true;
          mesh.add(snowMesh);
        }
      }

      mesh.userData = { tileType: info.type, biome, gx, gz };
      terrainGroup.add(mesh);

      const key = `${wx},${wz}`;
      tiles.set(key, { mesh, type: info.type, height: info.height, biome });

      if (info.type === 'water') waterTiles.add(key);
    }
  }

  // ── Bridge ──────────────────────────────────────────────────────────────
  if (bridge) {
    const bridgeWidth = bridge.maxGx - bridge.minGx + 3; // span + margin
    const bridgeGeom = new THREE.BoxGeometry(bridgeWidth, 0.12, 1.2);
    const bridgeMat = new THREE.MeshLambertMaterial({ color: PALETTE.path });
    const bridgeMesh = new THREE.Mesh(bridgeGeom, bridgeMat);
    const bridgeWx = ((bridge.minGx + bridge.maxGx) / 2) - HALF;
    const bridgeWz = bridge.gz - HALF;
    bridgeMesh.position.set(bridgeWx, 0.16, bridgeWz);
    bridgeMesh.receiveShadow = true;
    bridgeMesh.castShadow = true;
    bridgeMesh.userData = { tileType: 'bridge' };
    terrainGroup.add(bridgeMesh);

    // Mark bridge tiles as path tiles
    for (let gx = bridge.minGx - 1; gx <= bridge.maxGx + 1; gx++) {
      const key = `${gx - HALF},${bridge.gz - HALF}`;
      pathTiles.add(key);
    }
  }

  scene.add(terrainGroup);

  // ── Decoration group (populated later via addDecorations) ──────────────
  const decorationGroup = new THREE.Group();
  decorationGroup.name = 'decorations';
  scene.add(decorationGroup);

  // =====================================================================
  // Public API
  // =====================================================================

  // Track building centers with biome info for even distribution
  const buildingPositions = [];

  /**
   * Get a grass/sand tile suitable for placing a building.
   * Distributes buildings evenly across biomes (meadow, forest, desert)
   * with generous spacing between them.
   */
  function getAvailableGrassTile() {
    const candidates = [];
    for (let gx = 3; gx < GRID - 3; gx++) {
      for (let gz = 3; gz < GRID - 3; gz++) {
        const wx = gx - HALF;
        const wz = gz - HALF;
        const key = `${wx},${wz}`;
        const entry = tiles.get(key);
        if (!entry) continue;

        // Accept grass or sand tiles (meadow, forest, desert inner areas)
        if (entry.type !== 'grass' && entry.type !== 'sand') continue;
        if (usedTiles.has(key)) continue;

        // Reject mountain biome tiles for buildings (too high / rocky)
        if (entry.biome === 'mountain') continue;

        // 1-tile buffer from water
        let nearWater = false;
        for (let dx = -1; dx <= 1 && !nearWater; dx++) {
          for (let dz = -1; dz <= 1 && !nearWater; dz++) {
            if (waterTiles.has(`${wx + dx},${wz + dz}`)) nearWater = true;
          }
        }
        if (nearWater) continue;

        candidates.push({ x: wx, z: wz, biome: entry.biome, height: entry.height });
      }
    }

    if (candidates.length === 0) return null;

    // Count existing buildings per biome
    const biomeCounts = {};
    for (const bp of buildingPositions) {
      biomeCounts[bp.biome] = (biomeCounts[bp.biome] || 0) + 1;
    }

    // Group candidates by biome
    const byBiome = {};
    for (const c of candidates) {
      if (!byBiome[c.biome]) byBiome[c.biome] = [];
      byBiome[c.biome].push(c);
    }

    // Sort biomes: least populated first
    const biomeOrder = Object.keys(byBiome).sort(
      (a, b) => (biomeCounts[a] || 0) - (biomeCounts[b] || 0)
    );

    // Try each biome in order, find a well-spaced tile
    for (const biome of biomeOrder) {
      for (const c of byBiome[biome]) {
        let tooClose = false;
        for (const used of usedTiles) {
          const [ux, uz] = used.split(',').map(Number);
          if (Math.abs(ux - c.x) <= 5 && Math.abs(uz - c.z) <= 5) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) return c;
      }
    }

    // Fallback: any candidate from the least-populated biome
    if (biomeOrder.length > 0) {
      return byBiome[biomeOrder[0]][0];
    }
    return candidates[0] || null;
  }

  /**
   * Mark a tile (and its neighbors) as used by a building.
   * Also records the building center for biome-balanced placement.
   */
  function markTileUsed(x, z) {
    const key = `${x},${z}`;
    usedTiles.add(key);
    // Record building center with biome for distribution tracking
    const entry = tiles.get(key);
    if (entry) {
      buildingPositions.push({ x, z, biome: entry.biome });
    }
    // Also mark neighbors for breathing room
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        usedTiles.add(`${x + dx},${z + dz}`);
      }
    }
  }

  /**
   * Animate water tiles via GPU shader — single uniform update per frame.
   * @param {number} time - elapsed time in seconds
   */
  function animateWater(time) {
    waterShaderMat.uniforms.time.value = time;
  }

  /**
   * Add decorations (trees, rocks, wildflowers) AFTER buildings have been placed.
   * Checks usedTiles to avoid placing decorations on building sites.
   * @param {THREE.Scene} targetScene
   */
  function addDecorations(targetScene) {
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const wx = gx - HALF;
        const wz = gz - HALF;
        const key = `${wx},${wz}`;

        // Skip used tiles, water, mountain peaks
        if (usedTiles.has(key)) continue;
        if (waterTiles.has(key)) continue;

        const entry = tiles.get(key);
        if (!entry) continue;

        const biome = entry.biome;
        const rng = pseudoRandom(gx * 13, gz * 17);

        // ── Meadow: wildflowers (5% chance) ──────────────────────────────
        if (biome === 'meadow' && rng < 0.05) {
          const flowerColors = [PALETTE.wildflower1, PALETTE.wildflower2, PALETTE.wildflower3];
          const color = flowerColors[Math.floor(pseudoRandom(gx + 1, gz + 2) * flowerColors.length)];
          const flowerGeom = new THREE.SphereGeometry(0.03, 5, 4);
          const flowerMat = new THREE.MeshLambertMaterial({ color });
          const flower = new THREE.Mesh(flowerGeom, flowerMat);

          // Position slightly off-center on the tile
          const offsetX = (pseudoRandom(gx + 5, gz) - 0.5) * 0.6;
          const offsetZ = (pseudoRandom(gx, gz + 5) - 0.5) * 0.6;
          flower.position.set(offsetX, entry.height / 2 + 0.03, offsetZ);

          entry.mesh.add(flower);
        }

        // ── Forest: trees (15% chance) ──────────────────────────────────
        if (biome === 'forest' && rng < 0.15) {
          // Don't place trees too close to the edges (leave room for buildings)
          if (gx < 2 || gx >= GRID - 2 || gz < 2 || gz >= GRID - 2) continue;

          const tree = createTree(gx, gz);
          tree.position.set(wx, entry.height, wz);
          decorationGroup.add(tree);
        }

        // ── Desert: rock formations (8% chance) ─────────────────────────
        if (biome === 'desert' && rng < 0.08) {
          const rocks = createRockFormation(gx, gz);
          rocks.position.set(wx, entry.height, wz);
          decorationGroup.add(rocks);
        }

        // ── Mountain: boulders (12% chance) ──────────────────────────────
        if (biome === 'mountain' && entry.type !== 'mountain_peak' && rng < 0.12) {
          const boulder = createBoulder(gx, gz);
          boulder.position.set(wx, entry.height, wz);
          decorationGroup.add(boulder);
        }

      }
    }
  }

  /**
   * Get the biome name at a given world position.
   * @param {number} x - world x
   * @param {number} z - world z
   * @returns {string} biome name
   */
  function getBiomeAt(x, z) {
    const gx = x + HALF;
    const gz = z + HALF;
    if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) return 'unknown';
    return biomeAt(gx, gz, biomeMap);
  }

  /**
   * Merge all static (non-water) terrain and decoration meshes into batched
   * draw calls. Call AFTER addDecorations(). Returns swap helpers for heatmap.
   * @returns {{ showOriginals: () => void, showMerged: () => void }}
   */
  function mergeStaticGeometry() {
    // ── 1. Build skip set from water mesh UUIDs ────────────────────────
    const waterUUIDs = new Set(waterMeshes.map(m => m.uuid));

    // ── 2. Traverse both groups, collect meshes grouped by materialKey ──
    const groups = new Map(); // key -> { geoms: [], color, emissive, emissiveIntensity, castShadow, receiveShadow }
    const hiddenMeshes = [];  // originals to hide

    function collectMeshes(root) {
      root.traverse((child) => {
        if (!child.isMesh) return;
        if (waterUUIDs.has(child.uuid)) return;

        const mat = child.material;
        const colorHex = mat.color ? mat.color.getHex() : 0;
        const emissiveHex = mat.emissive ? mat.emissive.getHex() : 0;
        const emissiveIntensity = mat.emissiveIntensity || 0;
        const key = materialKey(colorHex, emissiveHex, emissiveIntensity, child.castShadow, child.receiveShadow);

        if (!groups.has(key)) {
          groups.set(key, {
            geoms: [],
            color: colorHex,
            emissive: emissiveHex,
            emissiveIntensity,
            castShadow: child.castShadow,
            receiveShadow: child.receiveShadow,
          });
        }

        // Clone geometry and bake world transform into vertices
        const cloned = child.geometry.clone();
        child.updateWorldMatrix(true, false);
        cloned.applyMatrix4(child.matrixWorld);
        groups.get(key).geoms.push(cloned);

        hiddenMeshes.push(child);
      });
    }

    collectMeshes(terrainGroup);
    collectMeshes(decorationGroup);

    // ── 4. Merge each group into a single mesh ─────────────────────────
    const mergedGroup = new THREE.Group();
    mergedGroup.name = 'mergedStatic';

    for (const [, grp] of groups) {
      if (grp.geoms.length === 0) continue;
      const merged = mergeGeometries(grp.geoms, false);
      if (!merged) continue;

      const mat = new THREE.MeshLambertMaterial({
        color: grp.color,
      });
      if (grp.emissive) {
        mat.emissive = new THREE.Color(grp.emissive);
        mat.emissiveIntensity = grp.emissiveIntensity;
      }

      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = grp.castShadow;
      mesh.receiveShadow = grp.receiveShadow;
      mergedGroup.add(mesh);
    }

    // ── 4. Hide originals ──────────────────────────────────────────────
    for (const m of hiddenMeshes) {
      m.visible = false;
    }
    decorationGroup.visible = false;

    // ── 5. Add merged group to scene ───────────────────────────────────
    scene.add(mergedGroup);

    // ── 8. Swap helpers for heatmap ────────────────────────────────────
    return {
      showOriginals() {
        mergedGroup.visible = false;
        terrainGroup.visible = true;
        decorationGroup.visible = true;
        for (const m of hiddenMeshes) m.visible = true;
      },
      showMerged() {
        for (const m of hiddenMeshes) m.visible = false;
        decorationGroup.visible = false;
        terrainGroup.visible = true; // water meshes still need to be visible
        // Re-hide non-water terrain meshes
        terrainGroup.traverse((child) => {
          if (child.isMesh && !waterUUIDs.has(child.uuid)) {
            child.visible = false;
          }
        });
        mergedGroup.visible = true;
      },
    };
  }

  /**
   * Get the terrain surface height at a world position.
   * Returns the top of the tile (full height for solid tiles, 0.08 for water).
   * For positions between tiles, uses the nearest tile.
   * @param {number} x - world x
   * @param {number} z - world z
   * @returns {number} surface Y coordinate
   */
  function getHeightAt(x, z) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    const entry = tiles.get(key);
    if (!entry) return 0.15; // fallback: default grass height
    return entry.height;
  }

  return {
    tiles,
    waterTiles,
    pathTiles,
    getAvailableGrassTile,
    markTileUsed,
    animateWater,
    addDecorations,
    getBiomeAt,
    getHeightAt,
    mergeStaticGeometry,
  };
}

// ---------------------------------------------------------------------------
// Decoration builders
// ---------------------------------------------------------------------------

/**
 * Create a simple low-poly tree: cylinder trunk + cone canopy.
 * @param {number} gx - grid x for deterministic variation
 * @param {number} gz - grid z for deterministic variation
 * @returns {THREE.Group}
 */
function createTree(gx, gz) {
  const tree = new THREE.Group();
  const rng = pseudoRandom(gx + 11, gz + 13);

  // Trunk
  const trunkHeight = 0.3 + rng * 0.15;
  const trunkGeom = new THREE.CylinderGeometry(0.06, 0.08, trunkHeight, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeTrunk });
  const trunk = new THREE.Mesh(trunkGeom, trunkMat);
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  // Canopy (cone)
  const canopyHeight = 0.4 + rng * 0.15;
  const canopyRadius = 0.2 + rng * 0.08;
  const canopyGeom = new THREE.ConeGeometry(canopyRadius, canopyHeight, 10);
  const leafColor = pseudoRandom(gx * 3, gz * 3) > 0.5 ? PALETTE.treeLeaves : PALETTE.treeLeavesAlt;
  const canopyMat = new THREE.MeshLambertMaterial({ color: leafColor });
  const canopy = new THREE.Mesh(canopyGeom, canopyMat);
  canopy.position.y = trunkHeight + canopyHeight / 2 - 0.05;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  tree.add(canopy);

  // Slight random rotation for variety
  tree.rotation.y = rng * Math.PI * 2;

  return tree;
}

/**
 * Create a mountain boulder: a large irregular rock for mountain biome.
 * @param {number} gx
 * @param {number} gz
 * @returns {THREE.Group}
 */
function createBoulder(gx, gz) {
  const g = new THREE.Group();
  const rng = pseudoRandom(gx + 23, gz + 31);

  const sx = 0.2 + rng * 0.25;
  const sy = 0.15 + rng * 0.3;
  const sz = 0.18 + rng * 0.2;

  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: rng > 0.5 ? PALETTE.mountainStone : PALETTE.stone,
  });
  const rock = new THREE.Mesh(geom, mat);
  rock.position.y = sy / 2;
  rock.rotation.set(
    (rng - 0.5) * 0.3,
    rng * Math.PI * 2,
    (rng - 0.5) * 0.2,
  );
  rock.castShadow = true;
  rock.receiveShadow = true;
  g.add(rock);

  // Occasional snow dusting on top
  if (rng > 0.6) {
    const snowGeom = new THREE.BoxGeometry(sx * 0.7, 0.03, sz * 0.7);
    const snowMat = new THREE.MeshLambertMaterial({ color: PALETTE.snow });
    const snow = new THREE.Mesh(snowGeom, snowMat);
    snow.position.y = sy + 0.01;
    g.add(snow);
  }

  return g;
}

/**
 * Create a small rock formation: 2-3 irregular box pieces.
 * @param {number} gx
 * @param {number} gz
 * @returns {THREE.Group}
 */
function createRockFormation(gx, gz) {
  const group = new THREE.Group();
  const count = pseudoRandom(gx + 7, gz + 11) > 0.5 ? 3 : 2;

  for (let i = 0; i < count; i++) {
    const rng = pseudoRandom(gx + i * 5, gz + i * 3);
    const sx = 0.08 + rng * 0.12;
    const sy = 0.06 + rng * 0.10;
    const sz = 0.08 + rng * 0.10;
    const geom = new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshLambertMaterial({ color: PALETTE.rock });
    const rock = new THREE.Mesh(geom, mat);

    rock.position.set(
      (pseudoRandom(gx + i, gz) - 0.5) * 0.4,
      sy / 2 + i * 0.04,
      (pseudoRandom(gx, gz + i) - 0.5) * 0.4
    );
    rock.rotation.set(
      (rng - 0.5) * 0.4,
      rng * Math.PI,
      (rng - 0.5) * 0.3
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  return group;
}
