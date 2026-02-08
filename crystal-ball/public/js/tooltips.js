// tooltips.js — Hover tooltip system for units.
// Shows a floating parchment card when the cursor hovers over a unit for 300ms.

import * as THREE from 'three';
import { rankDisplayTitle } from './units.js';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Map rank key to display name (role-aware via rankDisplayTitle).
 * @param {string|null} rank
 * @param {string} [unitClass]
 * @returns {string}
 */
export function rankDisplayName(rank, unitClass) {
  if (unitClass) return rankDisplayTitle(rank, unitClass);
  // Fallback for calls without unitClass
  switch (rank) {
    case 'bronze': return 'Senior';
    case 'silver': return 'Principal';
    case 'gold':   return 'Distinguished';
    default:       return '';
  }
}

/**
 * Format uptime seconds to human-readable string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatUptime(seconds) {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;

  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Compute tooltip position avoiding viewport overflow.
 * Default placement: 20px right, 10px below the cursor.
 * Flips left if overflowing right edge, flips above if overflowing bottom.
 * @param {number} mouseX
 * @param {number} mouseY
 * @param {number} tooltipWidth
 * @param {number} tooltipHeight
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{ left: number, top: number }}
 */
export function computeTooltipPosition(mouseX, mouseY, tooltipWidth, tooltipHeight, viewportWidth, viewportHeight) {
  let left = mouseX + 20;
  let top = mouseY + 10;

  // Flip horizontally if overflowing right edge
  if (left + tooltipWidth > viewportWidth) {
    left = mouseX - tooltipWidth - 20;
  }

  // Flip vertically if overflowing bottom edge
  if (top + tooltipHeight > viewportHeight) {
    top = mouseY - tooltipHeight - 10;
  }

  return { left, top };
}

/**
 * Format tooltip HTML from unit and session data.
 * @param {{ unitName: string, unitClass: string, rank: string|null }} unitData
 * @param {{ state: string, cpu: number, mem: number, age_seconds: number, group: string }|null} session
 * @returns {string} HTML string
 */
export function formatTooltipHTML(unitData, session) {
  const rankStar = unitData.rank === 'gold' ? '\u2605' : '\u2606';
  const rankLabel = rankDisplayName(unitData.rank, unitData.unitClass);

  let html = '';
  html += `<div class="tooltip-name">${escapeHTML(unitData.unitName)} the ${escapeHTML(rankLabel)}</div>`;
  html += `<div class="tooltip-rank">${rankStar} ${escapeHTML(unitData.unitClass)}</div>`;
  html += `<div class="tooltip-divider"></div>`;

  if (session) {
    const stateClass = `tooltip-state-${session.state}`;
    html += `<div class="tooltip-row"><span class="tooltip-label">State</span><span class="tooltip-value ${stateClass}">${escapeHTML(capitalize(session.state))}</span></div>`;
    html += `<div class="tooltip-row"><span class="tooltip-label">CPU</span><span class="tooltip-value">${session.cpu.toFixed(1)}%</span></div>`;
    html += `<div class="tooltip-row"><span class="tooltip-label">Memory</span><span class="tooltip-value">${session.mem} MB</span></div>`;
    html += `<div class="tooltip-row"><span class="tooltip-label">Uptime</span><span class="tooltip-value">${formatUptime(session.age_seconds)}</span></div>`;
    html += `<div class="tooltip-row"><span class="tooltip-label">Desk</span><span class="tooltip-value">${escapeHTML(session.group)}</span></div>`;
    if (session.owner) {
      const dotColor = session.ownerColor || '#A8D0E0';
      html += `<div class="tooltip-row"><span class="tooltip-label">Player</span><span class="tooltip-value"><span class="owner-dot" style="background:${dotColor}"></span> ${escapeHTML(session.owner)}</span></div>`;
    }
  } else {
    html += `<div class="tooltip-row"><span class="tooltip-label">No session data</span></div>`;
  }

  return html;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters. */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Capitalize the first letter of a string. */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// TooltipManager class
// ---------------------------------------------------------------------------

export class TooltipManager {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Scene} scene
   * @param {() => object} getLatestData — returns { sessions, groups }
   */
  constructor(camera, scene, getLatestData) {
    this.camera = camera;
    this.scene = scene;
    this.getLatestData = getLatestData;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    /** @type {HTMLDivElement|null} */
    this._tooltipEl = null;

    /** @type {HTMLCanvasElement|null} */
    this._canvas = null;

    /** The session ID of the unit currently being hovered. */
    this._hoveredSessionId = null;

    /** Timer handle for the 300ms hover delay. */
    this._hoverTimer = null;

    /** Whether the tooltip is currently visible. */
    this._visible = false;

    // Bound handlers for clean removal
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);
  }

  /**
   * Attach mousemove listener and create the tooltip DOM element.
   * @param {HTMLCanvasElement} canvas
   */
  init(canvas) {
    this._canvas = canvas;

    // Create tooltip element
    this._tooltipEl = document.createElement('div');
    this._tooltipEl.className = 'unit-tooltip';
    this._tooltipEl.style.display = 'none';
    document.body.appendChild(this._tooltipEl);

    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  /**
   * Remove listener and tooltip DOM.
   */
  dispose() {
    if (this._canvas) {
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
      this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
      this._canvas = null;
    }

    this._clearTimer();

    if (this._tooltipEl && this._tooltipEl.parentNode) {
      this._tooltipEl.parentNode.removeChild(this._tooltipEl);
    }
    this._tooltipEl = null;
    this._hoveredSessionId = null;
    this._visible = false;
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** @param {MouseEvent} e */
  _handleMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    // Walk intersections to find a unit
    let foundUnit = null;
    for (const hit of intersects) {
      let obj = hit.object;
      while (obj) {
        if (obj.userData && obj.userData.type === 'unit') {
          foundUnit = obj;
          break;
        }
        obj = obj.parent;
      }
      if (foundUnit) break;
    }

    if (foundUnit) {
      const sessionId = foundUnit.userData.sessionId;

      if (sessionId !== this._hoveredSessionId) {
        // Hovering a different unit — reset
        this._hideTooltip();
        this._hoveredSessionId = sessionId;
        this._clearTimer();
        this._hoverTimer = setTimeout(() => {
          this._showTooltip(foundUnit, e.clientX, e.clientY);
        }, 300);
      } else if (this._visible) {
        // Same unit, tooltip already visible — update position
        this._positionTooltip(e.clientX, e.clientY);
      }
    } else {
      // Not hovering any unit
      this._hideTooltip();
      this._hoveredSessionId = null;
      this._clearTimer();
    }
  }

  _handleMouseLeave() {
    this._hideTooltip();
    this._hoveredSessionId = null;
    this._clearTimer();
  }

  // ---------------------------------------------------------------------------
  // Tooltip display
  // ---------------------------------------------------------------------------

  /**
   * Show the tooltip for a given unit at the specified screen position.
   * @param {THREE.Object3D} unitMesh
   * @param {number} mouseX
   * @param {number} mouseY
   */
  _showTooltip(unitMesh, mouseX, mouseY) {
    if (!this._tooltipEl) return;

    const userData = unitMesh.userData;
    const data = this.getLatestData();
    const session = data && data.sessions
      ? data.sessions.find(s => s.id === userData.sessionId)
      : null;

    const unitData = {
      unitName: userData.unitName || 'Unknown',
      unitClass: userData.unitClass || 'Unknown',
      rank: userData.rank ?? null,
    };

    this._tooltipEl.innerHTML = formatTooltipHTML(unitData, session);
    this._tooltipEl.style.display = 'block';
    this._visible = true;

    // Position after making visible so we can measure dimensions
    this._positionTooltip(mouseX, mouseY);
  }

  /**
   * Position the tooltip relative to the cursor, flipping if it would overflow.
   * @param {number} mouseX
   * @param {number} mouseY
   */
  _positionTooltip(mouseX, mouseY) {
    if (!this._tooltipEl || !this._visible) return;

    const tooltipWidth = this._tooltipEl.offsetWidth;
    const tooltipHeight = this._tooltipEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const { left, top } = computeTooltipPosition(mouseX, mouseY, tooltipWidth, tooltipHeight, vw, vh);
    this._tooltipEl.style.left = `${left}px`;
    this._tooltipEl.style.top = `${top}px`;
  }

  /** Hide the tooltip immediately. */
  _hideTooltip() {
    if (this._tooltipEl) {
      this._tooltipEl.style.display = 'none';
    }
    this._visible = false;
  }

  /** Clear the 300ms hover delay timer. */
  _clearTimer() {
    if (this._hoverTimer !== null) {
      clearTimeout(this._hoverTimer);
      this._hoverTimer = null;
    }
  }
}

export default TooltipManager;
