// townhall.js -- GR HQ building mesh and "Market Open" victory screen.
//
// Pure functions (isFullDeployment, shouldTriggerVictory, victoryFade) are
// exported for testing without THREE.js. The TownHall and VictoryScreen
// classes depend on THREE / DOM and are intended for browser use only.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VICTORY_DISPLAY_DURATION = 5000;  // ms — how long the banner stays at full opacity
const VICTORY_FADE_DURATION    = 500;   // ms — fade-out after display
const VICTORY_COOLDOWN         = 30000; // ms — minimum gap between triggers

// Town Hall palette (GR HQ colors)
const TH_STONE     = 0x7A7A80;
const TH_BABYBLUE  = 0x89CFF0;
const TH_GRYELLOW  = 0xFFD700;
const TH_DOOR      = 0x3A2A1A;
const TH_WINDOW    = 0xEEDDCC;
const TH_GLOW      = 0xFFD700;

// ---------------------------------------------------------------------------
// Pure functions (testable without THREE)
// ---------------------------------------------------------------------------

/**
 * Returns true if every session is in the 'active' state and there is at
 * least one session.
 *
 * @param {Array<{state: string}>} sessions
 * @returns {boolean}
 */
export function isFullDeployment(sessions) {
  if (!sessions || sessions.length === 0) return false;
  return sessions.every(s => s.state === 'active');
}

/**
 * Determines whether the victory screen should fire.
 *
 * @param {boolean}  isDeployed      — result of isFullDeployment()
 * @param {number}   lastTriggerTime — timestamp (ms) of the last trigger, or 0
 * @param {number}   now             — current timestamp (ms)
 * @param {number}   cooldownMs      — minimum gap between triggers
 * @returns {boolean}
 */
export function shouldTriggerVictory(isDeployed, lastTriggerTime, now, cooldownMs) {
  if (!isDeployed) return false;
  if (lastTriggerTime === 0) return true;
  return (now - lastTriggerTime) > cooldownMs;
}

/**
 * Calculates the overlay opacity at a given elapsed time.
 *
 * - elapsed < displayDuration              → 1.0
 * - elapsed < displayDuration + fadeDuration → linear 1.0 → 0.0
 * - otherwise                               → 0.0
 *
 * @param {number} elapsed          — ms since the overlay was shown
 * @param {number} displayDuration  — ms at full opacity
 * @param {number} fadeDuration     — ms for the fade-out ramp
 * @returns {number} opacity in [0, 1]
 */
export function victoryFade(elapsed, displayDuration, fadeDuration) {
  if (elapsed < 0) return 1.0;
  if (elapsed < displayDuration) return 1.0;
  if (fadeDuration <= 0) return 0.0;
  const fadeElapsed = elapsed - displayDuration;
  if (fadeElapsed >= fadeDuration) return 0.0;
  return 1.0 - (fadeElapsed / fadeDuration);
}

// ---------------------------------------------------------------------------
// Helper: create a mesh with shadow casting (mirrors buildings.js pattern)
// ---------------------------------------------------------------------------

function m(geometry, color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    ...(opts.emissive !== undefined ? { emissive: opts.emissive } : {}),
    ...(opts.emissiveIntensity !== undefined ? { emissiveIntensity: opts.emissiveIntensity } : {}),
    ...(opts.side !== undefined ? { side: opts.side } : {}),
    ...(opts.transparent !== undefined ? { transparent: opts.transparent } : {}),
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// TownHall class — creates the 3D mesh group
// ---------------------------------------------------------------------------

export class TownHall {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this._scene = scene;
    /** @type {THREE.Group|null} */
    this.mesh = null;
  }

  /**
   * Creates and adds the Town Hall mesh + standing stone monument to the
   * scene at (0, 0, 0). Returns the mesh group.
   *
   * @returns {THREE.Group}
   */
  createMesh() {
    const g = new THREE.Group();

    // --- Stone keep ---
    const keep = m(new THREE.BoxGeometry(2.0, 1.6, 2.0), TH_STONE);
    keep.position.set(0, 0.8, 0);
    g.add(keep);

    // --- Tower (top-left corner) — taller ---
    const tower1 = m(new THREE.BoxGeometry(0.6, 0.8, 0.6), TH_STONE);
    tower1.position.set(-0.7, 2.0, -0.7);
    g.add(tower1);

    // Tower 1 cone roof (baby blue)
    const cone1 = m(new THREE.ConeGeometry(0.4, 0.5, 8), TH_BABYBLUE);
    cone1.position.set(-0.7, 2.65, -0.7);
    g.add(cone1);

    // --- Tower (top-right corner) -- shorter ---
    const tower2 = m(new THREE.BoxGeometry(0.6, 0.6, 0.6), TH_STONE);
    tower2.position.set(0.7, 1.9, -0.7);
    g.add(tower2);

    // Tower 2 cone roof (GR yellow)
    const cone2 = m(new THREE.ConeGeometry(0.4, 0.5, 8), TH_GRYELLOW);
    cone2.position.set(0.7, 2.45, -0.7);
    g.add(cone2);

    // --- GR Banner on front face ---
    // Baby blue background
    const bannerBg = m(
      new THREE.PlaneGeometry(0.4, 0.6),
      TH_BABYBLUE,
      { side: THREE.DoubleSide }
    );
    bannerBg.position.set(0.3, 1.1, 1.01);
    g.add(bannerBg);

    // Yellow stripe across middle of banner
    const bannerStripe = m(
      new THREE.PlaneGeometry(0.4, 0.12),
      TH_GRYELLOW,
      { side: THREE.DoubleSide }
    );
    bannerStripe.position.set(0.3, 1.1, 1.02);
    g.add(bannerStripe);

    // --- Door ---
    const door = m(new THREE.BoxGeometry(0.5, 0.7, 0.05), TH_DOOR);
    door.position.set(0, 0.35, 1.01);
    g.add(door);

    // --- Two window cutouts on the front ---
    const winLeft = m(new THREE.BoxGeometry(0.2, 0.25, 0.05), TH_WINDOW);
    winLeft.position.set(-0.5, 1.2, 1.01);
    g.add(winLeft);

    const winRight = m(new THREE.BoxGeometry(0.2, 0.25, 0.05), TH_WINDOW);
    winRight.position.set(0.5, 1.2, 1.01);
    g.add(winRight);

    // --- Inner warm glow ---
    const glow = new THREE.PointLight(TH_GLOW, 0.5, 4);
    glow.position.set(0, 0.8, 0.5);
    g.add(glow);

    // --- Standing stone monument nearby ---
    const monument = m(new THREE.BoxGeometry(0.15, 0.4, 0.08), TH_STONE);
    monument.position.set(1.5, 0.2, 1.0);
    monument.rotation.z = 0.1; // slightly tilted
    g.add(monument);

    // --- userData ---
    g.userData = {
      type: 'building',
      buildingType: 'TownHall',
      groupId: '__townhall__',
    };

    // Place at map centre
    g.position.set(0, 0, 0);

    this._scene.add(g);
    this.mesh = g;
    return g;
  }
}

// ---------------------------------------------------------------------------
// VictoryScreen class — manages the HTML "FULL DEPLOYMENT" overlay
// ---------------------------------------------------------------------------

export class VictoryScreen {
  /**
   * @param {object} [particles] — optional ParticleSystem reference for confetti
   */
  constructor(particles) {
    /** @type {object|null} */
    this._particles = particles || null;

    /** @type {HTMLElement|null} */
    this._overlay = null;

    /** @type {number} timestamp (ms) of the last trigger, 0 = never */
    this._lastTriggerTime = 0;

    /** @type {number|null} */
    this._showTime = null;

    /** @type {number|null} animation frame id */
    this._rafId = null;
  }

  /**
   * Called each poll cycle with the latest sessions array.
   * Checks deployment status and triggers/hides the overlay as appropriate.
   *
   * @param {Array<{state: string}>} sessions
   * @param {object} [particles] — optional ParticleSystem override
   */
  update(sessions, particles) {
    if (particles) this._particles = particles;

    const deployed = isFullDeployment(sessions);
    const now = Date.now();

    if (shouldTriggerVictory(deployed, this._lastTriggerTime, now, VICTORY_COOLDOWN)) {
      this._show();
      this._lastTriggerTime = now;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: show the overlay, auto-hide after display + fade duration
  // -----------------------------------------------------------------------

  /** @private */
  _show() {
    // If already showing, do nothing
    if (this._overlay) return;

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';

    const text = document.createElement('div');
    text.className = 'victory-text';
    text.textContent = 'MARKET OPEN';
    overlay.appendChild(text);

    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._showTime = Date.now();

    // Fire confetti if particle system is available
    if (this._particles && typeof this._particles.spawnDeathMotes === 'function') {
      // Spawn gold motes from several positions for a confetti-like effect
      for (let i = 0; i < 5; i++) {
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          0.5,
          (Math.random() - 0.5) * 6
        );
        this._particles.spawnDeathMotes(pos);
      }
    }

    // Start fade animation loop
    this._animateFade();
  }

  /** @private */
  _animateFade() {
    if (!this._overlay || this._showTime === null) return;

    const elapsed = Date.now() - this._showTime;
    const opacity = victoryFade(elapsed, VICTORY_DISPLAY_DURATION, VICTORY_FADE_DURATION);

    this._overlay.style.opacity = String(opacity);

    if (opacity <= 0) {
      this._hide();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._animateFade());
  }

  /** @private */
  _hide() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    this._showTime = null;
  }
}
