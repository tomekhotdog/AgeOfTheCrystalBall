// memoryScale.js — Memory-based unit size scaling with smooth lerp.
// Phase 5.4
//
// Memory usage maps to unit scale:
//   < 100 MB  -> 0.9
//   100-300 MB -> 1.0 (default)
//   300-500 MB -> 1.1
//   > 500 MB  -> 1.2
//
// Scale transitions are smoothly lerped each frame so units grow/shrink
// organically rather than popping.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Pure functions (no THREE dependency)
// ---------------------------------------------------------------------------

/**
 * Returns the target scale factor for a given memory usage in megabytes.
 * @param {number} memMB — memory in megabytes
 * @returns {number} target scale factor
 */
export function scaleFromMemory(memMB) {
  if (memMB < 100) return 0.9;
  if (memMB < 300) return 1.0;
  if (memMB < 500) return 1.1;
  return 1.2;
}

/**
 * Lerp (linear interpolation) from current scale toward target scale.
 * Snaps to target when within 0.001 to avoid perpetual micro-adjustments.
 * @param {number} current — current scale value
 * @param {number} target — target scale value
 * @param {number} delta — frame delta time in seconds
 * @param {number} [speed=2.0] — interpolation speed multiplier
 * @returns {number} new scale value
 */
export function lerpScale(current, target, delta, speed = 2.0) {
  const newScale = current + (target - current) * Math.min(1, delta * speed);
  if (Math.abs(newScale - target) < 0.001) return target;
  return newScale;
}

// ---------------------------------------------------------------------------
// MemoryScaler class
// ---------------------------------------------------------------------------

/**
 * Manages per-session target scales derived from memory usage, and smoothly
 * lerps unit meshes toward those targets each frame.
 *
 * The base scale is stored in `mesh.userData._memScale` so that other visual
 * systems (e.g. stateVisuals setting scale.y = 0.8 for stale units) can
 * read and compose on top of it.
 */
export class MemoryScaler {
  constructor() {
    /** @type {Map<string, number>} sessionId -> target scale */
    this._targets = new Map();
  }

  /**
   * Called each poll cycle with fresh session data.  Updates target scales
   * for all known sessions and prunes targets for sessions that no longer
   * exist.
   * @param {Array<{ id: string, mem: number }>} sessions
   */
  updateTargets(sessions) {
    const currentIds = new Set();

    for (const session of sessions) {
      currentIds.add(session.id);
      const target = scaleFromMemory(session.mem);
      this._targets.set(session.id, target);
    }

    // Prune stale entries
    for (const id of this._targets.keys()) {
      if (!currentIds.has(id)) {
        this._targets.delete(id);
      }
    }
  }

  /**
   * Called each frame.  Lerps every unit mesh toward its memory-derived
   * target scale.
   *
   * Preserves any y-scale override from stateVisuals (stale units have
   * scale.y = 0.8) by tracking the base scale separately in userData and
   * letting stateVisuals apply its own y override on top.
   *
   * @param {Map<string, { mesh: THREE.Group, session: object }>} units
   * @param {number} delta — frame delta time in seconds
   */
  animate(units, delta) {
    for (const [sessionId, unit] of units) {
      const target = this._targets.get(sessionId);
      if (target === undefined) continue;

      const mesh = unit.mesh;
      const current = mesh.userData._memScale ?? 1.0;
      const newScale = lerpScale(current, target, delta);

      mesh.userData._memScale = newScale;

      // Apply scale, preserving the stale-y override from stateVisuals.
      // stateVisuals sets scale.y = 0.8 for stale units after our animate,
      // so we just set the base scale uniformly here.  The stale y-squash
      // is handled by stateVisuals overwriting scale.y each frame.
      mesh.scale.set(newScale, newScale, newScale);
    }
  }
}

export default MemoryScaler;
