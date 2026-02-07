// stateVisuals.js — State-driven visual modifiers applied on top of activity animations.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const PALETTE = {
  unitBody: 0xD4B892,
  unitActive: 0x8ECF9A,
  unitAwait: 0xF0D05A,
  unitIdle: 0xB0B0B0,
  unitStale: 0x888888,
  unitBlocked: 0xC41E3A,
  crystalGlow: 0xB08EEC,
};

const _colorCache = {};
function getColor(hex) {
  if (!_colorCache[hex]) _colorCache[hex] = new THREE.Color(hex);
  return _colorCache[hex];
}

/**
 * Applies state-specific visual modifiers to a unit group.
 * Should be called every frame AFTER the activity animation.
 *
 * @param {THREE.Group} unitGroup — the unit group created by createUnit()
 * @param {'active'|'awaiting'|'idle'|'stale'} state
 * @param {number} time — elapsed time in seconds
 * @returns {{ speedMultiplier: number }} — hints for the caller to scale animation speed
 */
export function applyStateVisuals(unitGroup, state, time) {
  const bodyMesh = unitGroup.getObjectByName('body');
  const headMesh = unitGroup.getObjectByName('head');

  let speedMultiplier = 1.0;

  switch (state) {
    // ----- ACTIVE: normal appearance, full speed -----
    case 'active': {
      if (bodyMesh) {
        bodyMesh.material.color.copy(getColor(PALETTE.unitBody));
        bodyMesh.material.emissive?.set(0x000000);
        bodyMesh.material.emissiveIntensity = 0;
        bodyMesh.material.opacity = 1.0;
        bodyMesh.material.transparent = false;
      }
      if (headMesh) {
        headMesh.material.opacity = 1.0;
        headMesh.material.transparent = false;
      }
      speedMultiplier = 1.0;
      removeAwaitLabel(unitGroup);
      removeBlockedLabel(unitGroup);
      // Reset scale only if we were previously stale (slumped)
      if (unitGroup.scale.y < 0.9) unitGroup.scale.y = 1.0;
      break;
    }

    // ----- AWAITING: gold emissive pulse, floating "!" label -----
    case 'awaiting': {
      if (bodyMesh) {
        bodyMesh.material.color.copy(getColor(PALETTE.unitBody));
        if (!bodyMesh.material.emissive) bodyMesh.material.emissive = new THREE.Color();
        const pulseIntensity = 0.25 + 0.25 * Math.sin(time * Math.PI * 2);
        bodyMesh.material.emissive.set(PALETTE.unitAwait);
        bodyMesh.material.emissiveIntensity = pulseIntensity;
        bodyMesh.material.opacity = 1.0;
        bodyMesh.material.transparent = false;
      }
      if (headMesh) {
        headMesh.material.opacity = 1.0;
        headMesh.material.transparent = false;
      }
      speedMultiplier = 0.5;
      ensureAwaitLabel(unitGroup);
      removeBlockedLabel(unitGroup);
      if (unitGroup.scale.y < 0.9) unitGroup.scale.y = 1.0;
      break;
    }

    // ----- IDLE: desaturated, muted, slower -----
    case 'idle': {
      if (bodyMesh) {
        bodyMesh.material.color.copy(getColor(PALETTE.unitIdle));
        bodyMesh.material.emissive?.set(0x000000);
        bodyMesh.material.emissiveIntensity = 0;
        bodyMesh.material.opacity = 0.8;
        bodyMesh.material.transparent = true;
      }
      if (headMesh) {
        headMesh.material.opacity = 0.8;
        headMesh.material.transparent = true;
      }
      speedMultiplier = 0.5;
      removeAwaitLabel(unitGroup);
      removeBlockedLabel(unitGroup);
      if (unitGroup.scale.y < 0.9) unitGroup.scale.y = 1.0;
      break;
    }

    // ----- STALE: grey, translucent, frozen, slumped -----
    case 'stale': {
      if (bodyMesh) {
        bodyMesh.material.color.copy(getColor(PALETTE.unitStale));
        bodyMesh.material.emissive?.set(0x000000);
        bodyMesh.material.emissiveIntensity = 0;
        bodyMesh.material.opacity = 0.4;
        bodyMesh.material.transparent = true;
      }
      if (headMesh) {
        headMesh.material.opacity = 0.4;
        headMesh.material.transparent = true;
      }
      speedMultiplier = 0; // frozen -- no animation
      removeAwaitLabel(unitGroup);
      removeBlockedLabel(unitGroup);
      unitGroup.scale.y = 0.8; // slumped
      break;
    }

    // ----- BLOCKED: red emissive pulse, floating "X" label -----
    case 'blocked': {
      if (bodyMesh) {
        bodyMesh.material.color.copy(getColor(PALETTE.unitBody));
        if (!bodyMesh.material.emissive) bodyMesh.material.emissive = new THREE.Color();
        const pulseIntensity = 0.3 + 0.3 * Math.sin(time * Math.PI * 6); // 3Hz
        bodyMesh.material.emissive.set(PALETTE.unitBlocked);
        bodyMesh.material.emissiveIntensity = pulseIntensity;
        bodyMesh.material.opacity = 1.0;
        bodyMesh.material.transparent = false;
      }
      if (headMesh) {
        headMesh.material.opacity = 1.0;
        headMesh.material.transparent = false;
      }
      speedMultiplier = 0.3;
      removeAwaitLabel(unitGroup);
      ensureBlockedLabel(unitGroup);
      if (unitGroup.scale.y < 0.9) unitGroup.scale.y = 1.0;
      break;
    }

    default:
      break;
  }

  return { speedMultiplier };
}

// ---------------------------------------------------------------------------
// Await label management ("!" floating above unit)
// ---------------------------------------------------------------------------

export const MAX_AWAIT_LABELS = 20;
let _awaitLabelCount = 0;

function ensureAwaitLabel(unitGroup) {
  if (unitGroup.getObjectByName('awaitLabel')) return; // already exists
  if (_awaitLabelCount >= MAX_AWAIT_LABELS) return;    // cap reached

  const div = document.createElement('div');
  div.textContent = '!';
  div.style.cssText =
    'color: #E8C84A; font-size: 18px; font-weight: bold; ' +
    'text-shadow: 0 0 4px rgba(0,0,0,0.5); pointer-events: none;';

  const label = new CSS2DObject(div);
  label.position.set(0, 0.9, 0);
  label.name = 'awaitLabel';
  unitGroup.add(label);
  _awaitLabelCount++;
}

function removeAwaitLabel(unitGroup) {
  const existing = unitGroup.getObjectByName('awaitLabel');
  if (existing) {
    // Clean up DOM element.
    if (existing.element && existing.element.parentNode) {
      existing.element.parentNode.removeChild(existing.element);
    }
    unitGroup.remove(existing);
    _awaitLabelCount--;
  }
}

/** Reset label count (for testing). */
export function resetAwaitLabelCount() {
  _awaitLabelCount = 0;
}

/** Get current label count (for testing). */
export function getAwaitLabelCount() {
  return _awaitLabelCount;
}

// ---------------------------------------------------------------------------
// Blocked label management ("X" floating above unit, red)
// ---------------------------------------------------------------------------

export const MAX_BLOCKED_LABELS = 20;
let _blockedLabelCount = 0;

function ensureBlockedLabel(unitGroup) {
  if (unitGroup.getObjectByName('blockedLabel')) return;
  if (_blockedLabelCount >= MAX_BLOCKED_LABELS) return;

  const div = document.createElement('div');
  div.textContent = '\u2716';
  div.style.cssText =
    'color: #C41E3A; font-size: 18px; font-weight: bold; ' +
    'text-shadow: 0 0 4px rgba(0,0,0,0.5); pointer-events: none;';

  const label = new CSS2DObject(div);
  label.position.set(0, 0.9, 0);
  label.name = 'blockedLabel';
  unitGroup.add(label);
  _blockedLabelCount++;
}

function removeBlockedLabel(unitGroup) {
  const existing = unitGroup.getObjectByName('blockedLabel');
  if (existing) {
    if (existing.element && existing.element.parentNode) {
      existing.element.parentNode.removeChild(existing.element);
    }
    unitGroup.remove(existing);
    _blockedLabelCount--;
  }
}

// ---------------------------------------------------------------------------
// Child-process companion indicator
// ---------------------------------------------------------------------------

// Reusable geometry / material for the orbiting companion sphere.
let _companionGeom = null;
let _companionMat = null;

function getCompanionParts() {
  if (!_companionGeom) {
    _companionGeom = new THREE.SphereGeometry(0.06, 8, 8);
  }
  if (!_companionMat) {
    _companionMat = new THREE.MeshLambertMaterial({
      color: PALETTE.crystalGlow,
      emissive: PALETTE.crystalGlow,
      emissiveIntensity: 0.3,
    });
  }
  return { geom: _companionGeom, mat: _companionMat };
}

/**
 * Shows / hides a small orbiting companion sphere around the unit to indicate
 * that the session has child processes.
 *
 * @param {THREE.Group} unitGroup
 * @param {boolean} hasChildren
 * @param {number} time
 */
export function updateChildIndicator(unitGroup, hasChildren, time) {
  let companion = unitGroup.getObjectByName('childCompanion');

  if (!hasChildren) {
    // Remove if present.
    if (companion) {
      unitGroup.remove(companion);
    }
    return;
  }

  // Create companion if missing.
  if (!companion) {
    const { geom, mat } = getCompanionParts();
    companion = new THREE.Mesh(geom, mat);
    companion.name = 'childCompanion';
    companion.castShadow = true;
    unitGroup.add(companion);
  }

  // Orbit around the unit.
  const orbitRadius = 0.3;
  const orbitSpeed = 2;
  const angle = time * orbitSpeed;
  companion.position.set(
    Math.cos(angle) * orbitRadius,
    0.5 + Math.sin(time * 3) * 0.04, // gentle vertical float
    Math.sin(angle) * orbitRadius
  );

  // Subtle emissive pulse.
  companion.material.emissiveIntensity = 0.2 + 0.15 * Math.sin(time * 4);
}
