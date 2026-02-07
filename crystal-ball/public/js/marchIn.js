// marchIn.js — Reinforcement march-in animations and gravestone death effects.
//
// New units march in from the nearest map edge toward their anchor position
// over ~2 seconds with easeOutQuad easing. When a unit dies, a small
// gravestone mesh appears at their last position and fades out over 60 seconds.
//
// Pure functions (computeEdgeSpawn, marchProgress, gravestoneFade) are
// exported for testing without THREE.js.  The MarchInManager class uses
// THREE for scene manipulation.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARCH_DURATION = 2.0;       // seconds for a full march
const GRAVESTONE_DURATION = 60.0; // seconds before gravestone fully fades
const GRAVESTONE_HOLD = 0.1;      // fraction of duration at full opacity
const GRID_SIZE = 28;

// ---------------------------------------------------------------------------
// Pure functions (no THREE dependency)
// ---------------------------------------------------------------------------

/**
 * Compute the nearest map edge spawn point for a reinforcement unit.
 *
 * The grid runs from -14 to +13 (GRID_SIZE = 28). We find which of the
 * four edges (left=-14, right=+13, top=-14, bottom=+13) is nearest to
 * the target position, then place the spawn point on that edge.
 *
 * Ties are broken by checking edges in order: left, right, top, bottom.
 *
 * @param {number} targetX — target X position on the grid
 * @param {number} targetZ — target Z position on the grid
 * @param {number} [gridSize=24] — total grid size
 * @returns {{ x: number, z: number }} — spawn position on the nearest edge
 */
export function computeEdgeSpawn(targetX, targetZ, gridSize = GRID_SIZE) {
  const half = gridSize / 2;
  const minEdge = -half;       // -12
  const maxEdge = half - 1;    // +11

  // Distance from each edge
  const distLeft   = Math.abs(targetX - minEdge);
  const distRight  = Math.abs(targetX - maxEdge);
  const distTop    = Math.abs(targetZ - minEdge);
  const distBottom = Math.abs(targetZ - maxEdge);

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  // Check in order: left, right, top, bottom (tie-break order)
  if (distLeft === minDist) {
    return { x: minEdge, z: targetZ };
  }
  if (distRight === minDist) {
    return { x: maxEdge, z: targetZ };
  }
  if (distTop === minDist) {
    return { x: targetX, z: minEdge };
  }
  // distBottom === minDist
  return { x: targetX, z: maxEdge };
}

/**
 * Compute march progress with easeOutQuad easing.
 *
 * @param {number} elapsed  — seconds since march started
 * @param {number} duration — total march duration in seconds
 * @returns {number} — progress in [0, 1] with easeOutQuad applied
 */
export function marchProgress(elapsed, duration) {
  if (duration <= 0) return 1;
  const t = Math.max(0, Math.min(1, elapsed / duration));
  // easeOutQuad: t * (2 - t)
  return t * (2 - t);
}

/**
 * Compute gravestone opacity over time.
 *
 * Stays at 1.0 for the first 10% of totalDuration (hold period),
 * then linearly fades from 1.0 to 0.0 over the remaining 90%.
 *
 * @param {number} elapsed       — seconds since gravestone was placed
 * @param {number} totalDuration — total fade-out duration in seconds
 * @returns {number} — opacity in [0, 1]
 */
export function gravestoneFade(elapsed, totalDuration) {
  if (totalDuration <= 0) return 0;
  if (elapsed < 0) return 1;

  const holdEnd = totalDuration * GRAVESTONE_HOLD;

  if (elapsed <= holdEnd) {
    return 1.0;
  }

  const fadeDuration = totalDuration - holdEnd;
  const fadeElapsed = elapsed - holdEnd;
  const opacity = 1.0 - (fadeElapsed / fadeDuration);
  return Math.max(0, Math.min(1, opacity));
}

// ---------------------------------------------------------------------------
// Gravestone mesh builder (private)
// ---------------------------------------------------------------------------

/**
 * Creates a small gravestone group with a base slab and a cross on top.
 * All parts are grey (0x808080) and cast shadows.
 *
 * @returns {THREE.Group}
 */
function createGravestone() {
  const group = new THREE.Group();
  const stoneColor = 0x808080;

  // Material shared by all parts — transparent for fade-out
  const material = new THREE.MeshStandardMaterial({
    color: stoneColor,
    transparent: true,
    opacity: 1.0,
  });

  // Base slab: 0.08 x 0.15 x 0.04
  const baseGeo = new THREE.BoxGeometry(0.08, 0.15, 0.04);
  const baseMesh = new THREE.Mesh(baseGeo, material);
  baseMesh.position.y = 0.075; // half of 0.15, so base sits on ground
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // Cross vertical bar: 0.015 x 0.08 x 0.01
  const crossVertGeo = new THREE.BoxGeometry(0.015, 0.08, 0.01);
  const crossVertMesh = new THREE.Mesh(crossVertGeo, material);
  // Position on top of the base slab
  crossVertMesh.position.y = 0.15 + 0.04; // base top + cross center
  crossVertMesh.castShadow = true;
  group.add(crossVertMesh);

  // Cross horizontal bar: 0.04 x 0.015 x 0.01
  const crossHorizGeo = new THREE.BoxGeometry(0.04, 0.015, 0.01);
  const crossHorizMesh = new THREE.Mesh(crossHorizGeo, material);
  // Position slightly above center of the vertical cross bar
  crossHorizMesh.position.y = 0.15 + 0.05;
  crossHorizMesh.castShadow = true;
  group.add(crossHorizMesh);

  return group;
}

// ---------------------------------------------------------------------------
// MarchInManager class
// ---------------------------------------------------------------------------

let _nextMarchId = 0;

export class MarchInManager {
  /**
   * @param {THREE.Scene} scene — the scene to add gravestones to
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this._scene = scene;

    /**
     * Active march-in records.
     * @type {Map<number, {
     *   id: number,
     *   mesh: THREE.Object3D,
     *   startX: number, startY: number, startZ: number,
     *   targetX: number, targetY: number, targetZ: number,
     *   elapsed: number,
     *   duration: number,
     * }>}
     */
    this._marches = new Map();

    /**
     * Active gravestones.
     * @type {Array<{
     *   group: THREE.Group,
     *   elapsed: number,
     *   duration: number,
     * }>}
     */
    this._gravestones = [];
  }

  // -------------------------------------------------------------------------
  // March-in API
  // -------------------------------------------------------------------------

  /**
   * Start a march-in animation for a mesh. The mesh is placed at the
   * nearest map edge and will lerp toward (targetX, targetY, targetZ)
   * over MARCH_DURATION seconds.
   *
   * The caller should NOT set the mesh position — this method does it.
   *
   * @param {THREE.Object3D} mesh     — the unit mesh
   * @param {number}         targetX  — destination X
   * @param {number}         targetY  — destination Y
   * @param {number}         targetZ  — destination Z
   * @returns {{ id: number, startX: number, startZ: number }}
   */
  startMarch(mesh, targetX, targetY, targetZ) {
    const spawn = computeEdgeSpawn(targetX, targetZ);

    mesh.position.set(spawn.x, targetY, spawn.z);

    const id = _nextMarchId++;
    this._marches.set(id, {
      id,
      mesh,
      startX: spawn.x,
      startY: targetY,
      startZ: spawn.z,
      targetX,
      targetY,
      targetZ,
      elapsed: 0,
      duration: MARCH_DURATION,
    });

    return { id, startX: spawn.x, startZ: spawn.z };
  }

  /**
   * Update all active marches. Called every frame.
   *
   * @param {number} delta — frame delta in seconds
   * @returns {number[]} — IDs of marches that completed this frame
   */
  updateMarches(delta) {
    const completed = [];

    for (const [id, march] of this._marches) {
      march.elapsed += delta;
      const t = marchProgress(march.elapsed, march.duration);

      // Lerp position
      march.mesh.position.x = march.startX + (march.targetX - march.startX) * t;
      march.mesh.position.y = march.startY + (march.targetY - march.startY) * t;
      march.mesh.position.z = march.startZ + (march.targetZ - march.startZ) * t;

      if (march.elapsed >= march.duration) {
        // Snap to exact target
        march.mesh.position.set(march.targetX, march.targetY, march.targetZ);
        completed.push(id);
        this._marches.delete(id);
      }
    }

    return completed;
  }

  // -------------------------------------------------------------------------
  // Gravestone API
  // -------------------------------------------------------------------------

  /**
   * Place a gravestone at the given world position.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {THREE.Group} — the gravestone group (for testing / reference)
   */
  placeGravestone(x, y, z) {
    const group = createGravestone();
    group.position.set(x, y, z);
    this._scene.add(group);

    this._gravestones.push({
      group,
      elapsed: 0,
      duration: GRAVESTONE_DURATION,
    });

    return group;
  }

  /**
   * Update all gravestones — fade opacity and remove expired ones.
   * Called every frame.
   *
   * @param {number} delta — frame delta in seconds
   */
  updateGravestones(delta) {
    for (let i = this._gravestones.length - 1; i >= 0; i--) {
      const gs = this._gravestones[i];
      gs.elapsed += delta;

      const opacity = gravestoneFade(gs.elapsed, gs.duration);

      // Apply opacity to all meshes in the group
      gs.group.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.opacity = opacity;
        }
      });

      // Remove if fully faded
      if (gs.elapsed >= gs.duration) {
        this._scene.remove(gs.group);
        gs.group.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this._gravestones.splice(i, 1);
      }
    }
  }
}
