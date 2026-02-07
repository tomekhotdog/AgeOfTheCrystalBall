// cameraRotation.js — 90-degree snap rotation of the isometric camera around Y.
// Phase 4.4: Q/E keys rotate the camera to the four cardinal orientations.

// ---------------------------------------------------------------------------
// Orientation offsets — the four isometric camera positions relative to the
// lookAt target.  Each sits at y=10, with x/z at +/-10.
// ---------------------------------------------------------------------------
const OFFSETS = [
  { x:  10, y: 10, z:  10 },  // NE (0)
  { x:  10, y: 10, z: -10 },  // SE (1)
  { x: -10, y: 10, z: -10 },  // SW (2)
  { x: -10, y: 10, z:  10 },  // NW (3)
];

const ORIENTATION_NAMES = ['NE', 'SE', 'SW', 'NW'];

/** Lerp speed — higher = snappier.  6 gives a ~500 ms feel. */
const LERP_SPEED = 6;

// ---------------------------------------------------------------------------
// Pure helper functions (no THREE dependency — safe to test in Node)
// ---------------------------------------------------------------------------

/**
 * Get the camera offset for a given orientation index.
 * @param {number} index — 0=NE, 1=SE, 2=SW, 3=NW
 * @returns {{ x: number, y: number, z: number }}
 */
export function getOrientationOffset(index) {
  const i = wrapOrientation(index);
  return { ...OFFSETS[i] };
}

/**
 * Wrap an orientation index to [0, 3].
 * @param {number} index
 * @returns {number}
 */
export function wrapOrientation(index) {
  return ((index % 4) + 4) % 4;
}

/**
 * Get the orientation name for an index.
 * @param {number} index
 * @returns {string}
 */
export function orientationName(index) {
  return ORIENTATION_NAMES[wrapOrientation(index)];
}

// ---------------------------------------------------------------------------
// CameraRotation class
// ---------------------------------------------------------------------------

export class CameraRotation {
  /**
   * @param {THREE.OrthographicCamera} camera
   * @param {number} distance — distance from target (default: sqrt(10^2+10^2+10^2))
   */
  constructor(camera, distance = Math.sqrt(300)) {
    this._camera = camera;
    this._distance = distance;

    /** Current orientation index: 0=NE, 1=SE, 2=SW, 3=NW */
    this._orientationIndex = 0;

    /** lookAt target in world space (y is always 0). */
    this._lookAtTarget = { x: 0, y: 0, z: 0 };

    /** Are we currently tweening? */
    this._animating = false;
  }

  /**
   * Rotate left (counter-clockwise): NE -> NW -> SW -> SE -> NE
   * Decrements the orientation index.
   */
  rotateLeft() {
    this._orientationIndex = wrapOrientation(this._orientationIndex - 1);
    this._animating = true;
  }

  /**
   * Rotate right (clockwise): NE -> SE -> SW -> NW -> NE
   * Increments the orientation index.
   */
  rotateRight() {
    this._orientationIndex = wrapOrientation(this._orientationIndex + 1);
    this._animating = true;
  }

  /**
   * Call each frame to smoothly tween toward the target orientation.
   * Uses exponential lerp so the motion is frame-rate-independent.
   * @param {number} delta — frame time in seconds
   * @returns {boolean} true if still animating
   */
  update(delta) {
    if (!this._animating) return false;

    const offset = OFFSETS[this._orientationIndex];
    const targetX = this._lookAtTarget.x + offset.x;
    const targetY = this._lookAtTarget.y + offset.y;
    const targetZ = this._lookAtTarget.z + offset.z;

    const t = 1 - Math.exp(-LERP_SPEED * delta);

    const pos = this._camera.position;
    pos.x += (targetX - pos.x) * t;
    pos.y += (targetY - pos.y) * t;
    pos.z += (targetZ - pos.z) * t;

    this._camera.lookAt(this._lookAtTarget.x, this._lookAtTarget.y, this._lookAtTarget.z);

    // Check if close enough to snap and stop
    const dx = targetX - pos.x;
    const dy = targetY - pos.y;
    const dz = targetZ - pos.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < 0.0001) {
      // Snap to exact position
      pos.x = targetX;
      pos.y = targetY;
      pos.z = targetZ;
      this._camera.lookAt(this._lookAtTarget.x, this._lookAtTarget.y, this._lookAtTarget.z);
      this._animating = false;
    }

    return this._animating;
  }

  /**
   * Get the current lookAt target (needed by camera panning).
   * @returns {{ x: number, y: number, z: number }}
   */
  getLookAtTarget() {
    return { ...this._lookAtTarget };
  }

  /**
   * Set the lookAt target (needed when camera is panned).
   * @param {number} x
   * @param {number} z
   */
  setLookAtTarget(x, z) {
    this._lookAtTarget.x = x;
    this._lookAtTarget.z = z;
  }

  /**
   * Get the current orientation index.
   * @returns {number}
   */
  getOrientationIndex() {
    return this._orientationIndex;
  }

  /**
   * Get the current orientation name.
   * @returns {string}
   */
  getOrientationName() {
    return ORIENTATION_NAMES[this._orientationIndex];
  }
}

export default CameraRotation;
