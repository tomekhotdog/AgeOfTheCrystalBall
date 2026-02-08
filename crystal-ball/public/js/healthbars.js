import * as THREE from 'three';

/**
 * Hash a string to a unsigned 32-bit integer (djb2).
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Return a deterministic THREE.Color derived from a group name.
 * Hue is spread across 360 degrees, saturation 60-80%, lightness 50-60%.
 */
export function platoonColor(groupName) {
  const h = hashString(groupName);
  const hue = h % 360;
  const saturation = 60 + (h >>> 8) % 21;   // 60-80
  const lightness = 50 + (h >>> 16) % 11;   // 50-60
  return new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
}

// Shared materials (created once, reused across all bars)
const BG_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x3A3848,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
  depthTest: false,
});

const FILL_MATERIALS = {
  active:  new THREE.MeshBasicMaterial({ color: 0xA8D0B0, side: THREE.DoubleSide, depthTest: false }),
  awaiting: new THREE.MeshBasicMaterial({ color: 0xE0D0A8, side: THREE.DoubleSide, depthTest: false }),
  idle:    new THREE.MeshBasicMaterial({ color: 0xC0B8C0, side: THREE.DoubleSide, depthTest: false }),
};

const BAR_WIDTH = 1.2;
const BAR_HEIGHT = 0.06;

export class HealthBarManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this._scene = scene;
    /** @type {Set<THREE.Group>} all health-bar groups for billboard updates */
    this._bars = new Set();
  }

  /**
   * Create a floating health bar as a child of `buildingMesh`.
   * Returns a handle object used with updateHealthBar / removal.
   *
   * @param {THREE.Mesh} buildingMesh
   * @returns {{ group: THREE.Group, segments: { active: THREE.Mesh, awaiting: THREE.Mesh, idle: THREE.Mesh }, bg: THREE.Mesh }}
   */
  createHealthBar(buildingMesh) {
    const group = new THREE.Group();
    group.position.set(0, 2.6, 0);
    group.renderOrder = 999;

    // Background track
    const bgGeo = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT);
    const bg = new THREE.Mesh(bgGeo, BG_MATERIAL);
    bg.position.z = -0.001; // slightly behind fills
    group.add(bg);

    // Fill segments – each starts at full width; updateHealthBar will resize.
    const makeSegment = (material) => {
      const geo = new THREE.PlaneGeometry(1, BAR_HEIGHT);
      const mesh = new THREE.Mesh(geo, material);
      mesh.scale.x = 0;          // hidden until first update
      mesh.position.z = 0;
      group.add(mesh);
      return mesh;
    };

    const segments = {
      active:  makeSegment(FILL_MATERIALS.active),
      awaiting: makeSegment(FILL_MATERIALS.awaiting),
      idle:    makeSegment(FILL_MATERIALS.idle),
    };

    buildingMesh.add(group);
    this._bars.add(group);

    const handle = { group, segments, bg };
    return handle;
  }

  /**
   * Update segment widths based on current session states.
   *
   * @param {object} handle  – the object returned by createHealthBar
   * @param {Array}  sessions – array of session objects, each having a `.state` property
   */
  updateHealthBar(handle, sessions) {
    if (!handle || !sessions) return;

    const total = sessions.length;
    if (total === 0) {
      handle.segments.active.scale.x = 0;
      handle.segments.awaiting.scale.x = 0;
      handle.segments.idle.scale.x = 0;
      return;
    }

    let activeCount = 0;
    let awaitingCount = 0;
    let idleCount = 0;

    for (const s of sessions) {
      switch (s.state) {
        case 'active':
          activeCount++;
          break;
        case 'awaiting':
          awaitingCount++;
          break;
        default: // idle, stale, or anything else
          idleCount++;
          break;
      }
    }

    const activeRatio  = activeCount / total;
    const awaitingRatio = awaitingCount / total;
    const idleRatio    = idleCount / total;

    // Each segment is a PlaneGeometry(1, BAR_HEIGHT).
    // scale.x stretches it; we position them side-by-side from left to right.

    const activeW  = BAR_WIDTH * activeRatio;
    const awaitingW = BAR_WIDTH * awaitingRatio;
    const idleW    = BAR_WIDTH * idleRatio;

    const leftEdge = -BAR_WIDTH / 2;

    // Active segment
    handle.segments.active.scale.x = activeW;
    handle.segments.active.position.x = leftEdge + activeW / 2;

    // Awaiting segment
    handle.segments.awaiting.scale.x = awaitingW;
    handle.segments.awaiting.position.x = leftEdge + activeW + awaitingW / 2;

    // Idle segment
    handle.segments.idle.scale.x = idleW;
    handle.segments.idle.position.x = leftEdge + activeW + awaitingW + idleW / 2;
  }

  /**
   * Call once per frame to billboard all health bars toward the camera.
   *
   * @param {THREE.Camera} camera
   */
  updateAllBillboards(camera) {
    for (const group of this._bars) {
      // Copy camera world quaternion so the bar always faces the viewer.
      group.quaternion.copy(camera.quaternion);
    }
  }

  /**
   * Remove a health bar created by createHealthBar.
   *
   * @param {object} handle
   */
  removeHealthBar(handle) {
    if (!handle) return;
    const group = handle.group;
    if (group.parent) {
      group.parent.remove(group);
    }
    this._bars.delete(group);
  }
}
