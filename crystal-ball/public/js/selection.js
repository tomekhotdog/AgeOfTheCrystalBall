// selection.js — Raycaster-based click handling, box-select (drag rectangle),
// shift-click multi-selection, and highlight system.
// Phase 3.1: supports multi-unit selection via box drag and shift+click.

import * as THREE from 'three';

export class SelectionManager {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Scene} scene
   * @param {import('./worldManager.js').WorldManager} worldManager
   * @param {(sessionId: string) => void} onSelectUnit
   * @param {(sessionIds: string[]) => void} onSelectMultiple
   * @param {(groupId: string) => void} onSelectBuilding
   * @param {() => void} onDeselect
   */
  constructor(camera, scene, worldManager, onSelectUnit, onSelectMultiple, onSelectBuilding, onDeselect) {
    this.camera = camera;
    this.scene = scene;
    this.worldManager = worldManager;
    this.onSelectUnit = onSelectUnit;
    this.onSelectMultiple = onSelectMultiple;
    this.onSelectBuilding = onSelectBuilding;
    this.onDeselect = onDeselect;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // ── Multi-selection state ─────────────────────────────────────────────
    /** @type {Array<{ mesh: THREE.Object3D, originals: Map<THREE.Mesh, {emissive: THREE.Color, intensity: number}> }>} */
    this.selectedUnits = [];

    /** @type {{ mesh: THREE.Object3D, originals: Map<THREE.Mesh, {emissive: THREE.Color, intensity: number}> }|null} */
    this.selectedBuilding = null;

    // ── Drag / box-select state ───────────────────────────────────────────
    this._mouseDownPos = { x: 0, y: 0 };
    this._isPointerDown = false;
    this._isDragging = false;

    /** True while the box overlay is visible and a box-select is in progress. */
    this.isBoxSelecting = false;

    /** @type {HTMLDivElement|null} */
    this._boxOverlay = null;
  }

  /**
   * Attach event listeners to the renderer's DOM element and create the
   * box-select overlay div.
   * @param {HTMLCanvasElement} canvas
   */
  init(canvas) {
    this._canvas = canvas;

    // Create box-select overlay (hidden by default)
    this._boxOverlay = document.createElement('div');
    this._boxOverlay.className = 'box-select-overlay';
    this._boxOverlay.style.display = 'none';
    document.body.appendChild(this._boxOverlay);

    canvas.addEventListener('pointerdown', this._onPointerDown.bind(this));
    window.addEventListener('pointermove', this._onPointerMove.bind(this));
    window.addEventListener('pointerup', this._onPointerUp.bind(this));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Clear all highlights and fire the onDeselect callback.
   * Intended to be called externally (e.g. by a hotkeys module).
   */
  deselectAll() {
    this._clearAllHighlights();
    this.onDeselect();
  }

  /**
   * Returns an array of session IDs for the currently selected units.
   * Empty array if no units are selected.
   * @returns {string[]}
   */
  getSelectedSessionIds() {
    return this.selectedUnits.map(entry => entry.mesh.userData.sessionId);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** @param {PointerEvent} e */
  _onPointerDown(e) {
    if (e.button !== 0) return; // left button only
    this._mouseDownPos.x = e.clientX;
    this._mouseDownPos.y = e.clientY;
    this._isPointerDown = true;
    this._isDragging = false;
    this.isBoxSelecting = false;
  }

  /** @param {PointerEvent} e */
  _onPointerMove(e) {
    if (!this._isPointerDown) return;

    const dx = e.clientX - this._mouseDownPos.x;
    const dy = e.clientY - this._mouseDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 5) {
      this._isDragging = true;
      this.isBoxSelecting = true;
      this._updateBoxOverlay(e.clientX, e.clientY);
    }
  }

  /** @param {PointerEvent} e */
  _onPointerUp(e) {
    if (e.button !== 0) return;
    if (!this._isPointerDown) return;
    this._isPointerDown = false;

    if (this._isDragging && this.isBoxSelecting) {
      // ── Box select ──────────────────────────────────────────────────────
      this._performBoxSelect(e);
      this._hideBoxOverlay();
      this._isDragging = false;
      this.isBoxSelecting = false;
      return;
    }

    this._isDragging = false;
    this.isBoxSelecting = false;

    // Only treat as a click if the mouse moved less than 5 px
    const dx = e.clientX - this._mouseDownPos.x;
    const dy = e.clientY - this._mouseDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) return;

    this._performPick(e);
  }

  // ---------------------------------------------------------------------------
  // Box overlay helpers
  // ---------------------------------------------------------------------------

  /**
   * Show and position the box overlay between the mouse-down origin and the
   * current cursor position.
   * @param {number} curX
   * @param {number} curY
   */
  _updateBoxOverlay(curX, curY) {
    const left = Math.min(this._mouseDownPos.x, curX);
    const top = Math.min(this._mouseDownPos.y, curY);
    const width = Math.abs(curX - this._mouseDownPos.x);
    const height = Math.abs(curY - this._mouseDownPos.y);

    const s = this._boxOverlay.style;
    s.display = 'block';
    s.left = `${left}px`;
    s.top = `${top}px`;
    s.width = `${width}px`;
    s.height = `${height}px`;
  }

  _hideBoxOverlay() {
    if (this._boxOverlay) {
      this._boxOverlay.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Box select logic
  // ---------------------------------------------------------------------------

  /**
   * Find all units whose screen-projected positions fall within the drag
   * rectangle, and select them.
   * @param {PointerEvent} e — the pointerup event (gives us the end position)
   */
  _performBoxSelect(e) {
    const x1 = Math.min(this._mouseDownPos.x, e.clientX);
    const y1 = Math.min(this._mouseDownPos.y, e.clientY);
    const x2 = Math.max(this._mouseDownPos.x, e.clientX);
    const y2 = Math.max(this._mouseDownPos.y, e.clientY);

    const hits = []; // { mesh, sessionId }

    for (const [sessionId, unit] of this.worldManager.units) {
      const pos = unit.mesh.position.clone();
      pos.project(this.camera);

      const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-pos.y * 0.5 + 0.5) * window.innerHeight;

      if (screenX >= x1 && screenX <= x2 && screenY >= y1 && screenY <= y2) {
        hits.push({ mesh: unit.mesh, sessionId });
      }
    }

    // Clear all current highlights first
    this._clearAllHighlights();

    if (hits.length === 0) {
      // Empty box selects nothing — deselect all
      this.onDeselect();
      return;
    }

    // Apply highlight to every hit unit
    for (const hit of hits) {
      this._applyUnitHighlight(hit.mesh);
    }

    if (hits.length === 1) {
      this.onSelectUnit(hits[0].sessionId);
    } else {
      this.onSelectMultiple(hits.map(h => h.sessionId));
    }
  }

  // ---------------------------------------------------------------------------
  // Raycasting & single/shift-click selection
  // ---------------------------------------------------------------------------

  /** @param {PointerEvent} e */
  _performPick(e) {
    const rect = this._canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    let foundUnit = null;
    let foundBuilding = null;

    for (const hit of intersects) {
      let obj = hit.object;
      // Walk up the parent chain looking for userData.type
      while (obj) {
        if (obj.userData.type === 'unit') {
          foundUnit = obj;
          break;
        }
        if (obj.userData.type === 'building') {
          foundBuilding = obj;
          break;
        }
        obj = obj.parent;
      }
      if (foundUnit || foundBuilding) break;
    }

    const shiftHeld = e.shiftKey;

    if (foundUnit) {
      if (shiftHeld) {
        this._shiftClickUnit(foundUnit);
      } else {
        // Regular click: replace entire selection with just this unit
        this._clearAllHighlights();
        this._applyUnitHighlight(foundUnit);
        this.onSelectUnit(foundUnit.userData.sessionId);
      }
    } else if (foundBuilding) {
      // Building selection: always single, clears unit selection
      this._clearAllHighlights();
      this._applyBuildingHighlight(foundBuilding);
      this.onSelectBuilding(foundBuilding.userData.groupId);
    } else {
      // Clicked on empty space
      if (!shiftHeld) {
        this._clearAllHighlights();
        this.onDeselect();
      }
      // Shift+click on empty space: do nothing
    }
  }

  // ---------------------------------------------------------------------------
  // Shift-click toggle
  // ---------------------------------------------------------------------------

  /**
   * Toggle a unit in/out of the current multi-selection.
   * @param {THREE.Object3D} unitMesh
   */
  _shiftClickUnit(unitMesh) {
    const sessionId = unitMesh.userData.sessionId;

    // Clear building selection if we had one (switching to unit selection)
    if (this.selectedBuilding) {
      this._clearBuildingHighlight();
    }

    // Check if this unit is already selected
    const existingIndex = this.selectedUnits.findIndex(
      entry => entry.mesh.userData.sessionId === sessionId
    );

    if (existingIndex >= 0) {
      // Already selected — remove it (toggle off)
      this._clearSingleUnitHighlight(existingIndex);
    } else {
      // Not selected — add it (toggle on)
      this._applyUnitHighlight(unitMesh);
    }

    // Fire the appropriate callback based on how many are now selected
    const ids = this.getSelectedSessionIds();
    if (ids.length === 0) {
      this.onDeselect();
    } else if (ids.length === 1) {
      this.onSelectUnit(ids[0]);
    } else {
      this.onSelectMultiple(ids);
    }
  }

  // ---------------------------------------------------------------------------
  // Highlight helpers
  // ---------------------------------------------------------------------------

  /**
   * Apply selection glow to a unit mesh and add it to `selectedUnits`.
   * @param {THREE.Object3D} obj
   */
  _applyUnitHighlight(obj) {
    const originals = new Map();

    obj.traverse(child => {
      if (child.isMesh && child.material && child.material.emissive) {
        originals.set(child, {
          emissive: child.material.emissive.clone(),
          intensity: child.material.emissiveIntensity ?? 0,
        });
        child.material.emissive.setHex(0x44ff44);
        child.material.emissiveIntensity = 0.3;
      }
    });

    this.selectedUnits.push({ mesh: obj, originals });
  }

  /**
   * Apply selection glow to a building mesh. Clears any existing building
   * highlight first.
   * @param {THREE.Object3D} obj
   */
  _applyBuildingHighlight(obj) {
    this._clearBuildingHighlight();

    const originals = new Map();

    obj.traverse(child => {
      if (child.isMesh && child.material && child.material.emissive) {
        originals.set(child, {
          emissive: child.material.emissive.clone(),
          intensity: child.material.emissiveIntensity ?? 0,
        });
        child.material.emissive.setHex(0x44ff44);
        child.material.emissiveIntensity = 0.3;
      }
    });

    this.selectedBuilding = { mesh: obj, originals };
  }

  /**
   * Remove highlight from a single unit by index and splice it out of the
   * selectedUnits array.
   * @param {number} index
   */
  _clearSingleUnitHighlight(index) {
    const entry = this.selectedUnits[index];
    if (!entry) return;

    for (const [child, saved] of entry.originals) {
      if (child.material && child.material.emissive) {
        child.material.emissive.copy(saved.emissive);
        child.material.emissiveIntensity = saved.intensity;
      }
    }

    this.selectedUnits.splice(index, 1);
  }

  /**
   * Remove highlight from all selected units.
   */
  _clearAllUnitHighlights() {
    for (const entry of this.selectedUnits) {
      for (const [child, saved] of entry.originals) {
        if (child.material && child.material.emissive) {
          child.material.emissive.copy(saved.emissive);
          child.material.emissiveIntensity = saved.intensity;
        }
      }
    }
    this.selectedUnits = [];
  }

  /**
   * Remove highlight from the selected building.
   */
  _clearBuildingHighlight() {
    if (!this.selectedBuilding) return;

    for (const [child, saved] of this.selectedBuilding.originals) {
      if (child.material && child.material.emissive) {
        child.material.emissive.copy(saved.emissive);
        child.material.emissiveIntensity = saved.intensity;
      }
    }

    this.selectedBuilding = null;
  }

  /**
   * Remove all highlights (both units and building).
   */
  _clearAllHighlights() {
    this._clearAllUnitHighlights();
    this._clearBuildingHighlight();
  }
}

export default SelectionManager;
