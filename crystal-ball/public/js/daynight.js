// daynight.js — Day/night cycle controller for the Crystal Ball world.
// Smoothly transitions directional light, ambient light, and sky colour
// through four phases over a configurable cycle (default 300 s).
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Phase definitions
// ---------------------------------------------------------------------------
const PHASES = [
  { name: 'dawn',  duration: 15,  dirColor: '#FFD0C0', dirIntensity: 1.5,  ambColor: '#CCAABB', ambIntensity: 0.8,  sky: '#E8D0C4' },
  { name: 'day',   duration: 210, dirColor: '#FFF5E6', dirIntensity: 1.3,  ambColor: '#99AABB', ambIntensity: 0.55, sky: '#E8E0D4' },
  { name: 'dusk',  duration: 15,  dirColor: '#FFAA70', dirIntensity: 1.5,  ambColor: '#BB9977', ambIntensity: 0.8,  sky: '#D4B088' },
  { name: 'night', duration: 60,  dirColor: '#D8E4FF', dirIntensity: 1.8,  ambColor: '#AABBDD', ambIntensity: 1.0,  sky: '#5A6A90' },
];

// Pre-computed total so we don't recalculate every frame.
const DEFAULT_CYCLE = PHASES.reduce((sum, p) => sum + p.duration, 0); // 300

// ---------------------------------------------------------------------------
// Sun position keyframes (one per phase start).
// Interpolated with the same progress value used for colours.
// ---------------------------------------------------------------------------
const SUN_POSITIONS = [
  { x: 10, y: 3,  z:  0 },   // dawn  — east horizon
  { x:  5, y: 10, z:  5 },   // day   — high noon
  { x:  0, y: 3,  z: -10 },  // dusk  — west horizon
  { x: -5, y: 8,  z: -5 },   // night — full moon high overhead
];

// ---------------------------------------------------------------------------
// calculatePhase  (pure, no THREE dependency — importable by tests)
// ---------------------------------------------------------------------------
/**
 * Given total elapsed seconds and cycle duration, determine the current phase,
 * the progress within that phase (0-1), and overall cycle progress (0-1).
 *
 * @param {number} elapsed  Total elapsed seconds (may exceed cycleDuration).
 * @param {number} cycleDuration  Length of one full cycle in seconds.
 * @returns {{ phaseName: string, phaseIndex: number, phaseProgress: number, cycleProgress: number }}
 */
export function calculatePhase(elapsed, cycleDuration = DEFAULT_CYCLE) {
  // Scale phase durations proportionally when cycleDuration differs from 300.
  const scale = cycleDuration / DEFAULT_CYCLE;

  // Wrap elapsed into [0, cycleDuration)
  const wrapped = ((elapsed % cycleDuration) + cycleDuration) % cycleDuration;
  const cycleProgress = wrapped / cycleDuration;

  let accumulated = 0;
  for (let i = 0; i < PHASES.length; i++) {
    const phaseDur = PHASES[i].duration * scale;
    if (wrapped < accumulated + phaseDur) {
      const phaseProgress = (wrapped - accumulated) / phaseDur;
      return {
        phaseName: PHASES[i].name,
        phaseIndex: i,
        phaseProgress,
        cycleProgress,
      };
    }
    accumulated += phaseDur;
  }

  // Floating-point edge case — treat as last phase ending.
  return {
    phaseName: PHASES[PHASES.length - 1].name,
    phaseIndex: PHASES.length - 1,
    phaseProgress: 1.0,
    cycleProgress: 1.0,
  };
}

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/** Linearly interpolate two numbers. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth-step easing — removes harsh transitions at phase boundaries. */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// DayNightCycle class
// ---------------------------------------------------------------------------
export class DayNightCycle {
  /**
   * @param {object} opts
   * @param {THREE.DirectionalLight} opts.dirLight
   * @param {THREE.AmbientLight}     opts.ambientLight
   * @param {THREE.Scene}            opts.scene
   * @param {number}                 [opts.cycleDuration=300]
   */
  constructor({ dirLight, ambientLight, scene, cycleDuration = DEFAULT_CYCLE }) {
    this.dirLight     = dirLight;
    this.ambientLight = ambientLight;
    this.scene        = scene;
    this.cycleDuration = cycleDuration;

    // Pre-build THREE.Color objects for each phase to avoid per-frame allocs.
    this._phaseColors = PHASES.map((p) => ({
      dir: new THREE.Color(p.dirColor),
      amb: new THREE.Color(p.ambColor),
      sky: new THREE.Color(p.sky),
    }));

    // Temporary colours reused every frame.
    this._tmpDir = new THREE.Color();
    this._tmpAmb = new THREE.Color();
    this._tmpSky = new THREE.Color();

    // Cache last phase info so getPhase() works between updates.
    this._current = calculatePhase(0, this.cycleDuration);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Advance the cycle. Call once per frame with total elapsed seconds
   * (e.g. from THREE.Clock.getElapsedTime()).
   *
   * @param {number} elapsed  Total elapsed seconds since start.
   */
  update(elapsed) {
    const info = calculatePhase(elapsed, this.cycleDuration);
    this._current = info;

    const { phaseIndex, phaseProgress } = info;
    const nextIndex = (phaseIndex + 1) % PHASES.length;

    // Smooth the progress so transitions ease in/out at boundaries.
    const t = smoothstep(phaseProgress);

    // --- Colours --------------------------------------------------------
    const cur = this._phaseColors[phaseIndex];
    const nxt = this._phaseColors[nextIndex];

    this._tmpDir.lerpColors(cur.dir, nxt.dir, t);
    this._tmpAmb.lerpColors(cur.amb, nxt.amb, t);
    this._tmpSky.lerpColors(cur.sky, nxt.sky, t);

    this.dirLight.color.copy(this._tmpDir);
    this.ambientLight.color.copy(this._tmpAmb);
    this.scene.background.copy(this._tmpSky);

    // --- Intensities ----------------------------------------------------
    const curPhase = PHASES[phaseIndex];
    const nxtPhase = PHASES[nextIndex];

    this.dirLight.intensity     = lerp(curPhase.dirIntensity, nxtPhase.dirIntensity, t);
    this.ambientLight.intensity = lerp(curPhase.ambIntensity, nxtPhase.ambIntensity, t);

    // --- Sun position (semicircle arc) ----------------------------------
    const curPos = SUN_POSITIONS[phaseIndex];
    const nxtPos = SUN_POSITIONS[nextIndex];

    this.dirLight.position.set(
      lerp(curPos.x, nxtPos.x, t),
      lerp(curPos.y, nxtPos.y, t),
      lerp(curPos.z, nxtPos.z, t),
    );

    // Shadow camera bounds are NOT modified — preserving shadow quality.
  }

  /**
   * @returns {string} Current phase name: 'dawn' | 'day' | 'dusk' | 'night'.
   */
  getPhase() {
    return this._current.phaseName;
  }

  /**
   * @returns {number} 0.0 – 1.0 progress through the full cycle.
   */
  getCycleProgress() {
    return this._current.cycleProgress;
  }
}
