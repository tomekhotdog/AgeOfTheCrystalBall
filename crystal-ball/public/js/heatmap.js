// heatmap.js — Thermal overlay that colorizes terrain tiles based on
// nearby buildings' session CPU activity. Toggle via H key.
// Pure functions (cpuToHeatColor, findNearestBuilding, computeTileCpuMap)
// are THREE-free and directly testable in Node.js.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Heat colour thresholds
// ---------------------------------------------------------------------------

const HEAT_HOT  = 0xD09090;  // totalCpu > 100
const HEAT_WARM = 0xD8B898;  // 50 < totalCpu <= 100
const HEAT_COOL = 0xC0D0A0;  // 10 < totalCpu <= 50
const HEAT_COLD = 0x90B8C8;  // totalCpu <= 10

// ---------------------------------------------------------------------------
// Pure functions (no THREE dependency — safe for Node.js tests)
// ---------------------------------------------------------------------------

/**
 * Map a total CPU value to a hex colour integer.
 *
 * @param {number} totalCpu — sum of CPU percentages for the nearest group
 * @returns {number} hex colour (e.g. 0xD09090)
 */
export function cpuToHeatColor(totalCpu) {
  if (totalCpu > 100) return HEAT_HOT;
  if (totalCpu > 50)  return HEAT_WARM;
  if (totalCpu > 10)  return HEAT_COOL;
  return HEAT_COLD;
}

/**
 * Find the nearest building to a tile position (Euclidean distance).
 *
 * @param {number} tileX — tile world X
 * @param {number} tileZ — tile world Z
 * @param {Array<{x: number, z: number, groupId: string}>} buildings
 * @returns {string|null} groupId of the nearest building, or null if empty
 */
export function findNearestBuilding(tileX, tileZ, buildings) {
  if (!buildings || buildings.length === 0) return null;

  let bestDist = Infinity;
  let bestGroup = null;

  for (const b of buildings) {
    const dx = tileX - b.x;
    const dz = tileZ - b.z;
    const dist = dx * dx + dz * dz; // squared is fine for comparison
    if (dist < bestDist) {
      bestDist = dist;
      bestGroup = b.groupId;
    }
  }

  return bestGroup;
}

/**
 * Compute a Map of tile key ("x,z") to total CPU for that tile's nearest
 * building group.
 *
 * @param {Map<string, any>} tiles — terrain tiles map (keys "x,z")
 * @param {Array<{x: number, z: number, groupId: string}>} buildings
 * @param {Map<string, Array<{cpu: number}>>} sessionsByGroup — groupId -> sessions
 * @returns {Map<string, number>} tileKey -> totalCpu
 */
export function computeTileCpuMap(tiles, buildings, sessionsByGroup) {
  const result = new Map();

  if (!buildings || buildings.length === 0) {
    // No buildings — every tile gets 0 CPU
    for (const key of tiles.keys()) {
      result.set(key, 0);
    }
    return result;
  }

  for (const key of tiles.keys()) {
    const parts = key.split(',');
    const tileX = Number(parts[0]);
    const tileZ = Number(parts[1]);

    const groupId = findNearestBuilding(tileX, tileZ, buildings);
    const sessions = groupId ? (sessionsByGroup.get(groupId) || []) : [];

    let totalCpu = 0;
    for (const s of sessions) {
      totalCpu += (s.cpu || 0);
    }

    result.set(key, totalCpu);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Colour interpolation (smooth transitions)
// ---------------------------------------------------------------------------

const HEAT_COLORS_THREE = {
  hot:  new THREE.Color(HEAT_HOT),
  warm: new THREE.Color(HEAT_WARM),
  cool: new THREE.Color(HEAT_COOL),
  cold: new THREE.Color(HEAT_COLD),
};

/**
 * Return a smoothly interpolated THREE.Color for a given CPU value.
 * Uses linear interpolation between the two nearest threshold colours.
 *
 * @param {number} totalCpu
 * @returns {THREE.Color}
 */
function smoothHeatColor(totalCpu) {
  const color = new THREE.Color();

  if (totalCpu > 100) {
    // Saturate at hot — lerp from warm to hot between 100-200
    const t = Math.min((totalCpu - 100) / 100, 1);
    color.lerpColors(HEAT_COLORS_THREE.warm, HEAT_COLORS_THREE.hot, t);
  } else if (totalCpu > 50) {
    // Lerp between cool and warm
    const t = (totalCpu - 50) / 50;
    color.lerpColors(HEAT_COLORS_THREE.cool, HEAT_COLORS_THREE.warm, t);
  } else if (totalCpu > 10) {
    // Lerp between cold and cool
    const t = (totalCpu - 10) / 40;
    color.lerpColors(HEAT_COLORS_THREE.cold, HEAT_COLORS_THREE.cool, t);
  } else {
    // Lerp within cold range (0-10)
    color.copy(HEAT_COLORS_THREE.cold);
  }

  return color;
}

// ---------------------------------------------------------------------------
// Heatmap class
// ---------------------------------------------------------------------------

export class Heatmap {
  /**
   * @param {{ tiles: Map<string, {mesh: THREE.Mesh, type: string, height: number, biome: string}> }} terrain
   *   — the terrain object returned by generateTerrain()
   */
  constructor(terrain) {
    this._terrain = terrain;
    this._active = false;
    this._mergeSwap = null;

    /** @type {Map<string, THREE.Color>} tile key -> original material colour */
    this._originalColors = new Map();

    /** @type {Map<string, THREE.Color>} tile key -> current displayed colour (for lerping) */
    this._currentColors = new Map();
  }

  /**
   * Store the merge swap helpers returned by terrain.mergeStaticGeometry().
   * @param {{ showOriginals: () => void, showMerged: () => void }} result
   */
  setMergeSwap(result) {
    this._mergeSwap = result;
  }

  /**
   * Toggle the heatmap overlay on/off.
   */
  toggle() {
    this._active = !this._active;

    if (this._active) {
      // Show original meshes so heatmap can colorize individual tiles
      if (this._mergeSwap) this._mergeSwap.showOriginals();
    } else {
      this._restoreOriginalColors();
      // Switch back to merged geometry for performance
      if (this._mergeSwap) this._mergeSwap.showMerged();
    }
  }

  /**
   * @returns {boolean} whether the heatmap is currently active
   */
  isActive() {
    return this._active;
  }

  /**
   * Called each poll cycle with fresh API data and worldManager buildings.
   *
   * @param {{ sessions: Array<{id: string, group: string, cpu: number, state: string}>, groups: Array<{id: string}> }} apiData
   * @param {Map<string, {mesh: THREE.Mesh, position: {x: number, z: number}}>} buildings
   *   — worldManager.buildings map (groupId -> building record)
   */
  update(apiData, buildings) {
    if (!this._active) return;

    // ── Build building position array ────────────────────────────────────
    const buildingArray = [];
    for (const [groupId, bldg] of buildings) {
      buildingArray.push({
        x: bldg.position.x,
        z: bldg.position.z,
        groupId,
      });
    }

    // ── Group sessions by group ID ───────────────────────────────────────
    const sessionsByGroup = new Map();
    for (const session of apiData.sessions) {
      if (!sessionsByGroup.has(session.group)) {
        sessionsByGroup.set(session.group, []);
      }
      sessionsByGroup.get(session.group).push(session);
    }

    // ── Compute CPU map for each tile ────────────────────────────────────
    const cpuMap = computeTileCpuMap(this._terrain.tiles, buildingArray, sessionsByGroup);

    // ── Apply colours to tile meshes ─────────────────────────────────────
    for (const [key, tile] of this._terrain.tiles) {
      if (!tile.mesh || !tile.mesh.material || !tile.mesh.material.color) continue;

      // Store original colour on first paint
      if (!this._originalColors.has(key)) {
        this._originalColors.set(key, tile.mesh.material.color.clone());
      }

      const totalCpu = cpuMap.get(key) || 0;
      const targetColor = smoothHeatColor(totalCpu);

      // Smooth transition: lerp current colour toward target
      if (this._currentColors.has(key)) {
        const current = this._currentColors.get(key);
        current.lerp(targetColor, 0.15);
        tile.mesh.material.color.copy(current);
      } else {
        this._currentColors.set(key, targetColor.clone());
        tile.mesh.material.color.copy(targetColor);
      }
    }
  }

  /**
   * Restore all tile meshes to their original colours.
   * @private
   */
  _restoreOriginalColors() {
    for (const [key, originalColor] of this._originalColors) {
      const tile = this._terrain.tiles.get(key);
      if (tile && tile.mesh && tile.mesh.material && tile.mesh.material.color) {
        tile.mesh.material.color.copy(originalColor);
      }
    }

    // Clear stored colours so fresh originals are captured on next toggle-on
    this._originalColors.clear();
    this._currentColors.clear();
  }
}
