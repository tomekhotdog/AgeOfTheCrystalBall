// hotkeys.js — Keyboard hotkeys for quick navigation and selection.
// Phase 3.3: register shortcuts, dispatch actions on units/buildings/camera.

// ---------------------------------------------------------------------------
// Pure helper functions (no THREE dependency — safe to test in Node)
// ---------------------------------------------------------------------------

/**
 * Find the session that has been awaiting the longest.
 * @param {Array<{state: string, age_seconds: number}>} sessions
 * @returns {object|null} the session, or null if none awaiting
 */
export function findMostUrgent(sessions) {
  let best = null;
  for (const s of sessions) {
    if (s.state !== 'awaiting') continue;
    if (best === null || s.age_seconds > best.age_seconds) {
      best = s;
    }
  }
  return best;
}

/**
 * Find all idle or awaiting sessions, sorted by urgency:
 * awaiting first (longest wait), then idle (longest age).
 * @param {Array<{state: string, age_seconds: number}>} sessions
 * @returns {Array<object>}
 */
export function findIdleOrAwaiting(sessions) {
  const matches = sessions.filter(s => s.state === 'awaiting' || s.state === 'idle');
  // Awaiting first (by age desc), then idle (by age desc)
  matches.sort((a, b) => {
    if (a.state === 'awaiting' && b.state !== 'awaiting') return -1;
    if (a.state !== 'awaiting' && b.state === 'awaiting') return 1;
    return b.age_seconds - a.age_seconds;
  });
  return matches;
}

/**
 * Find all sessions in awaiting state.
 * @param {Array<{state: string}>} sessions
 * @returns {Array<object>}
 */
export function findAllAwaiting(sessions) {
  return sessions.filter(s => s.state === 'awaiting');
}

/**
 * Get the Nth group name (0-indexed).
 * @param {Array<{id: string}>} groups
 * @param {number} index
 * @returns {string|null}
 */
export function getNthGroup(groups, index) {
  if (index < 0 || index >= groups.length) return null;
  return groups[index].id;
}

/**
 * Compute the center position of multiple world positions.
 * @param {Array<{x: number, z: number}>} positions
 * @returns {{x: number, z: number}|null}
 */
export function averagePosition(positions) {
  if (positions.length === 0) return null;
  let sumX = 0;
  let sumZ = 0;
  for (const p of positions) {
    sumX += p.x;
    sumZ += p.z;
  }
  return { x: sumX / positions.length, z: sumZ / positions.length };
}

// ---------------------------------------------------------------------------
// Camera helper
// ---------------------------------------------------------------------------

/**
 * Center the isometric camera on a world (x, z) position.
 * The camera sits at an offset of (+10, 10, +10) from its look-at target.
 * @param {object} camera — THREE.Camera (orthographic)
 * @param {number} worldX
 * @param {number} worldZ
 */
function centerCameraOn(camera, worldX, worldZ) {
  camera.position.set(worldX + 10, 10, worldZ + 10);
  camera.lookAt(worldX, 0, worldZ);
}

// ---------------------------------------------------------------------------
// HotkeyManager
// ---------------------------------------------------------------------------

/** Tags where we should NOT intercept keyboard input. */
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export class HotkeyManager {
  /**
   * @param {object} deps — injected dependencies
   * @param {object} deps.worldManager — WorldManager instance
   * @param {object} deps.selectionManager — SelectionManager instance
   * @param {object} deps.camera — THREE.Camera
   * @param {object} deps.zoomController — ZoomController from scene.js
   * @param {() => object} deps.getLatestData — returns latest API data { sessions, groups }
   * @param {(sessions: object[]) => void} deps.onShowMultiUnit — callback to show multi-unit panel
   */
  constructor(deps) {
    this.worldManager = deps.worldManager;
    this.selectionManager = deps.selectionManager;
    this.camera = deps.camera;
    this.zoomController = deps.zoomController;
    this.getLatestData = deps.getLatestData;
    this.onShowMultiUnit = deps.onShowMultiUnit;

    /** Index into the idle/awaiting list for Space cycling. */
    this._spaceIndex = 0;

    /** Bound handler reference so we can remove it in dispose(). */
    this._onKeyDown = this._handleKeyDown.bind(this);
  }

  /** Attach keydown listener to window. */
  init() {
    window.addEventListener('keydown', this._onKeyDown);
  }

  /** Remove listener (for cleanup / teardown). */
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // -------------------------------------------------------------------------
  // Internal key handler
  // -------------------------------------------------------------------------

  /** @param {KeyboardEvent} e */
  _handleKeyDown(e) {
    // Don't hijack input when user is typing in a form control.
    if (e.target && INPUT_TAGS.has(e.target.tagName)) return;

    const key = e.key;

    // ── Space: jump to most urgent (longest-awaiting) unit ────────────────
    if (key === ' ') {
      e.preventDefault(); // prevent page scroll
      this._jumpToMostUrgent();
      return;
    }

    // ── a / A: select all awaiting units ─────────────────────────────────
    if (key === 'a' || key === 'A') {
      this._selectAllAwaiting();
      return;
    }

    // ── Escape: deselect all, close panels ───────────────────────────────
    if (key === 'Escape') {
      this._deselectAll();
      return;
    }

    // ── 1-5: jump camera to platoon N ────────────────────────────────────
    if (key >= '1' && key <= '5') {
      const index = parseInt(key, 10) - 1; // 0-indexed
      this._jumpToPlatoon(index);
      return;
    }

    // ── f / F: focus camera on current selection ─────────────────────────
    if (key === 'f' || key === 'F') {
      this._focusOnSelection();
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Action implementations
  // -------------------------------------------------------------------------

  /** Space — cycle camera through idle/awaiting units (most urgent first). */
  _jumpToMostUrgent() {
    const { sessions } = this.getLatestData();
    const candidates = findIdleOrAwaiting(sessions);
    if (candidates.length === 0) return;

    // Wrap index
    if (this._spaceIndex >= candidates.length) this._spaceIndex = 0;
    const target = candidates[this._spaceIndex];
    this._spaceIndex++;

    const unit = this.worldManager.units.get(target.id);
    if (!unit || !unit.mesh) return;

    const pos = unit.mesh.position;
    centerCameraOn(this.camera, pos.x, pos.z);

    // Also select the unit so user sees its info
    if (typeof this.selectionManager.selectMultiple === 'function') {
      this.selectionManager.selectMultiple([unit.mesh]);
    }
    this.onShowMultiUnit([target]);
  }

  /** a — select all awaiting units, show multi-unit panel. */
  _selectAllAwaiting() {
    const { sessions } = this.getLatestData();
    const awaiting = findAllAwaiting(sessions);
    if (awaiting.length === 0) return;

    // Gather meshes from worldManager
    const meshes = [];
    for (const s of awaiting) {
      const unit = this.worldManager.units.get(s.id);
      if (unit && unit.mesh) meshes.push(unit.mesh);
    }
    if (meshes.length === 0) return;

    // Use selectionManager to multi-select if it supports it,
    // otherwise highlight the first one and show the multi-unit panel.
    if (typeof this.selectionManager.selectMultiple === 'function') {
      this.selectionManager.selectMultiple(meshes);
    }

    this.onShowMultiUnit(awaiting);
  }

  /** Escape — clear selection and panels. */
  _deselectAll() {
    if (typeof this.selectionManager.deselectAll === 'function') {
      this.selectionManager.deselectAll();
    } else {
      // Fallback: trigger the existing deselect callback via _clearHighlight + onDeselect
      this.selectionManager._clearHighlight();
      if (typeof this.selectionManager.onDeselect === 'function') {
        this.selectionManager.onDeselect();
      }
    }
  }

  /** 1-5 — jump camera to the Nth group's building. */
  _jumpToPlatoon(index) {
    const { groups } = this.getLatestData();
    const groupId = getNthGroup(groups, index);
    if (!groupId) return;

    const bldg = this.worldManager.buildings.get(groupId);
    if (!bldg) return;

    centerCameraOn(this.camera, bldg.position.x, bldg.position.z);
  }

  /** f — center camera on average position of current selection. */
  _focusOnSelection() {
    // Collect positions from selected unit(s).
    // selectionManager.selected holds a single selection; if multi-select is
    // available via selectedMeshes, prefer that.
    const positions = [];

    if (this.selectionManager.selectedMeshes && this.selectionManager.selectedMeshes.length > 0) {
      for (const entry of this.selectionManager.selectedMeshes) {
        const mesh = entry.mesh || entry;
        positions.push({ x: mesh.position.x, z: mesh.position.z });
      }
    } else if (this.selectionManager.selected) {
      const mesh = this.selectionManager.selected.mesh;
      positions.push({ x: mesh.position.x, z: mesh.position.z });
    }

    if (positions.length === 0) return;

    const center = averagePosition(positions);
    if (!center) return;

    centerCameraOn(this.camera, center.x, center.z);
  }
}

export default HotkeyManager;
