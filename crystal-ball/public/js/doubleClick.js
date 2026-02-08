// doubleClick.js — Double-click selection: select all units of the same class,
// or all units in a building's group.
// Phase 5.4

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Pure functions (no THREE dependency)
// ---------------------------------------------------------------------------

/**
 * Given a class name and an array of unit descriptors, return the sessionIds
 * of all units that match the target class.
 * @param {string} targetClass -- e.g. 'Engineer', 'Researcher'
 * @param {Array<{ sessionId: string, unitClass: string }>} units
 * @returns {string[]} matching session IDs
 */
export function findAllOfClass(targetClass, units) {
  return units
    .filter(u => u.unitClass === targetClass)
    .map(u => u.sessionId);
}

/**
 * Given a groupId and an array of session descriptors, return the IDs of all
 * sessions that belong to that group.
 * @param {string} groupId
 * @param {Array<{ id: string, group: string }>} sessions
 * @returns {string[]} matching session IDs
 */
export function findAllInGroup(groupId, sessions) {
  return sessions
    .filter(s => s.group === groupId)
    .map(s => s.id);
}

/**
 * Returns true if the interval between lastClickTime and now is shorter than
 * the threshold (i.e. a double-click).
 * @param {number} lastClickTime — timestamp of previous click (ms)
 * @param {number} now — current timestamp (ms)
 * @param {number} [threshold=350] — max interval for double-click (ms)
 * @returns {boolean}
 */
export function isDoubleClick(lastClickTime, now, threshold = 350) {
  return (now - lastClickTime) < threshold;
}

// ---------------------------------------------------------------------------
// DoubleClickHandler class
// ---------------------------------------------------------------------------

/**
 * Tracks click timing and dispatches double-click selection logic.
 * Intended to be instantiated once and called from the SelectionManager's
 * click handlers.
 */
export class DoubleClickHandler {
  /**
   * @param {object} opts
   * @param {import('./worldManager.js').WorldManager} opts.worldManager
   * @param {import('./selection.js').SelectionManager} opts.selectionManager
   * @param {() => { sessions: object[], groups: object[] }} opts.getLatestData
   * @param {(sessionIds: string[]) => void} opts.onSelectMultiple
   */
  constructor({ worldManager, selectionManager, getLatestData, onSelectMultiple }) {
    this.worldManager = worldManager;
    this.selectionManager = selectionManager;
    this.getLatestData = getLatestData;
    this.onSelectMultiple = onSelectMultiple;

    /** @type {number} timestamp of last unit click */
    this._lastUnitClickTime = 0;
    /** @type {string|null} sessionId of last clicked unit */
    this._lastUnitSessionId = null;
    /** @type {string|null} unitClass of last clicked unit */
    this._lastUnitClass = null;

    /** @type {number} timestamp of last building click */
    this._lastBuildingClickTime = 0;
    /** @type {string|null} groupId of last clicked building */
    this._lastBuildingGroupId = null;
  }

  /**
   * Called from selection.js when a unit is clicked.  Checks whether this
   * constitutes a double-click and, if so, selects all units of the same class.
   * @param {string} sessionId
   * @param {string} unitClass
   * @param {number} [now=Date.now()]
   */
  handleUnitClick(sessionId, unitClass, now = Date.now()) {
    if (
      this._lastUnitClass === unitClass &&
      isDoubleClick(this._lastUnitClickTime, now)
    ) {
      // Double-click detected — select all of same class
      const unitDescriptors = [];
      for (const [sid, unit] of this.worldManager.units) {
        unitDescriptors.push({
          sessionId: sid,
          unitClass: unit.mesh.userData.unitClass,
        });
      }

      const matchingIds = findAllOfClass(unitClass, unitDescriptors);

      if (matchingIds.length > 0) {
        // Clear existing selection and highlight matching units
        this.selectionManager.deselectAll();
        for (const id of matchingIds) {
          const unit = this.worldManager.units.get(id);
          if (unit) {
            this.selectionManager._applyUnitHighlight(unit.mesh);
          }
        }
        this.onSelectMultiple(matchingIds);
      }

      // Reset after firing so a third click starts fresh
      this._lastUnitClickTime = 0;
      this._lastUnitSessionId = null;
      this._lastUnitClass = null;
    } else {
      // First click — record timing
      this._lastUnitClickTime = now;
      this._lastUnitSessionId = sessionId;
      this._lastUnitClass = unitClass;
    }

    // Reset building tracking on unit click
    this._lastBuildingClickTime = 0;
    this._lastBuildingGroupId = null;
  }

  /**
   * Called from selection.js when a building is clicked.  Checks whether this
   * constitutes a double-click and, if so, selects all units in that group.
   * @param {string} groupId
   * @param {number} [now=Date.now()]
   */
  handleBuildingClick(groupId, now = Date.now()) {
    if (
      this._lastBuildingGroupId === groupId &&
      isDoubleClick(this._lastBuildingClickTime, now)
    ) {
      // Double-click detected — select all units in the group
      const data = this.getLatestData();
      const matchingIds = findAllInGroup(groupId, data.sessions);

      if (matchingIds.length > 0) {
        this.selectionManager.deselectAll();
        for (const id of matchingIds) {
          const unit = this.worldManager.units.get(id);
          if (unit) {
            this.selectionManager._applyUnitHighlight(unit.mesh);
          }
        }
        this.onSelectMultiple(matchingIds);
      }

      // Reset after firing
      this._lastBuildingClickTime = 0;
      this._lastBuildingGroupId = null;
    } else {
      // First click — record timing
      this._lastBuildingClickTime = now;
      this._lastBuildingGroupId = groupId;
    }

    // Reset unit tracking on building click
    this._lastUnitClickTime = 0;
    this._lastUnitSessionId = null;
    this._lastUnitClass = null;
  }
}

export default DoubleClickHandler;
