// daynight.js — Day/night cycle controller for the Crystal Ball world.
// Follows real UTC business hours: day 09:00-18:00, dawn/dusk 30-min transitions.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// UTC schedule (minutes past midnight)
// ---------------------------------------------------------------------------
const DAWN_START  = 510;   // 08:30
const DAY_START   = 540;   // 09:00
const DUSK_START  = 1080;  // 18:00
const NIGHT_START = 1110;  // 18:30
const MINUTES_PER_DAY = 1440;

const DAWN_DUR  = DAY_START   - DAWN_START;                        // 30
const DAY_DUR   = DUSK_START  - DAY_START;                         // 540
const DUSK_DUR  = NIGHT_START - DUSK_START;                        // 30
const NIGHT_DUR = MINUTES_PER_DAY - NIGHT_START + DAWN_START;     // 840

// ---------------------------------------------------------------------------
// Phase visual definitions (colours / intensities)
// ---------------------------------------------------------------------------
const PHASES = [
  { name: 'dawn',  dirColor: '#F5D8D0', dirIntensity: 1.5,  ambColor: '#D0B8C8', ambIntensity: 0.8,  sky: '#F0DCD4' },
  { name: 'day',   dirColor: '#FFF8F0', dirIntensity: 1.6,  ambColor: '#B8D0E0', ambIntensity: 0.7,  sky: '#D8E4EC' },
  { name: 'dusk',  dirColor: '#E8C0A8', dirIntensity: 1.5,  ambColor: '#C8B0A0', ambIntensity: 0.8,  sky: '#DCC4B0' },
  { name: 'night', dirColor: '#C8D0E8', dirIntensity: 1.8,  ambColor: '#B0B8D0', ambIntensity: 1.0,  sky: '#6A7090' },
];

// Sun position keyframes (one per phase).
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
 * Given UTC minutes past midnight, determine the current phase,
 * progress within that phase (0-1), and overall cycle progress (0-1).
 * The cycle starts at dawn (08:30 UTC).
 *
 * @param {number} utcMinutes  Minutes past midnight UTC (0-1440, fractional OK).
 * @returns {{ phaseName: string, phaseIndex: number, phaseProgress: number, cycleProgress: number }}
 */
export function calculatePhase(utcMinutes) {
  const m = ((utcMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const cycleProgress = ((m - DAWN_START + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_DAY;

  if (m >= DAWN_START && m < DAY_START) {
    return {
      phaseName: 'dawn',
      phaseIndex: 0,
      phaseProgress: (m - DAWN_START) / DAWN_DUR,
      cycleProgress,
    };
  }
  if (m >= DAY_START && m < DUSK_START) {
    return {
      phaseName: 'day',
      phaseIndex: 1,
      phaseProgress: (m - DAY_START) / DAY_DUR,
      cycleProgress,
    };
  }
  if (m >= DUSK_START && m < NIGHT_START) {
    return {
      phaseName: 'dusk',
      phaseIndex: 2,
      phaseProgress: (m - DUSK_START) / DUSK_DUR,
      cycleProgress,
    };
  }

  // Night: 18:30 -> 08:30 (wraps past midnight)
  let nightElapsed;
  if (m >= NIGHT_START) {
    nightElapsed = m - NIGHT_START;
  } else {
    nightElapsed = (MINUTES_PER_DAY - NIGHT_START) + m;
  }
  return {
    phaseName: 'night',
    phaseIndex: 3,
    phaseProgress: nightElapsed / NIGHT_DUR,
    cycleProgress,
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

/** Get current UTC minutes past midnight (fractional). */
function utcMinutesNow() {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
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
   */
  constructor({ dirLight, ambientLight, scene }) {
    this.dirLight     = dirLight;
    this.ambientLight = ambientLight;
    this.scene        = scene;

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
    this._current = calculatePhase(utcMinutesNow());
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Advance the cycle based on real UTC time. Call once per frame.
   * The elapsed parameter is accepted for backwards compatibility but ignored.
   */
  update() {
    const info = calculatePhase(utcMinutesNow());
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
  }

  /**
   * @returns {string} Current phase name: 'dawn' | 'day' | 'dusk' | 'night'.
   */
  getPhase() {
    return this._current.phaseName;
  }

  /**
   * @returns {number} 0.0 - 1.0 progress within the current phase.
   */
  getPhaseProgress() {
    return this._current.phaseProgress;
  }

  /**
   * @returns {number} 0.0 - 1.0 progress through the full 24h cycle.
   */
  getCycleProgress() {
    return this._current.cycleProgress;
  }
}
