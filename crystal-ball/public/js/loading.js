// loading.js — Loading screen + camera intro module for Age of the Crystal Ball
// Pure DOM manipulation, no Three.js dependency.

// ─── LoadingScreen ──────────────────────────────────────────────────────────

export class LoadingScreen {
  constructor() {
    this._removed = false;

    // Inject keyframe animation into the document head
    const styleEl = document.createElement('style');
    styleEl.textContent = `
@keyframes crystalPulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(160, 126, 220, 0.4), 0 0 60px rgba(160, 126, 220, 0.2);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 30px rgba(160, 126, 220, 0.6), 0 0 80px rgba(160, 126, 220, 0.3);
    transform: scale(1.05);
  }
}`;
    document.head.appendChild(styleEl);
    this._styleEl = styleEl;

    // ── Root overlay ──────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.id = 'loading-screen';
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      background: '#1a1a2e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '1',
      transition: 'opacity 800ms ease',
    });
    this._root = root;

    // ── Title ─────────────────────────────────────────────────────────────
    const title = document.createElement('div');
    title.textContent = 'Age of the Crystal Ball';
    Object.assign(title.style, {
      fontFamily: "'Cinzel', serif",
      fontSize: '32px',
      color: '#e8c84a',
      letterSpacing: '3px',
      marginBottom: '32px',
      textAlign: 'center',
      userSelect: 'none',
    });
    root.appendChild(title);

    // ── Crystal ball orb ──────────────────────────────────────────────────
    const orb = document.createElement('div');
    Object.assign(orb.style, {
      width: '80px',
      height: '80px',
      borderRadius: '50%',
      background: 'radial-gradient(circle at center, #A07EDC 0%, transparent 70%)',
      animation: 'crystalPulse 2.4s ease-in-out infinite',
      marginBottom: '28px',
    });
    root.appendChild(orb);

    // ── Subtitle ──────────────────────────────────────────────────────────
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Scrying your realm...';
    Object.assign(subtitle.style, {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '14px',
      color: 'rgba(232, 224, 212, 0.6)', // #e8e0d4 at 60% opacity
      marginBottom: '20px',
      userSelect: 'none',
    });
    root.appendChild(subtitle);

    // ── Progress bar ──────────────────────────────────────────────────────
    const track = document.createElement('div');
    Object.assign(track.style, {
      width: '200px',
      height: '4px',
      background: '#2a2a3e',
      borderRadius: '2px',
      overflow: 'hidden',
    });

    const fill = document.createElement('div');
    Object.assign(fill.style, {
      width: '0%',
      height: '100%',
      background: '#e8c84a',
      borderRadius: '2px',
      transition: 'width 200ms ease',
    });
    track.appendChild(fill);
    root.appendChild(track);

    this._fill = fill;

    // Append to DOM
    document.body.appendChild(root);
  }

  /** Set progress bar width. @param {number} fraction — 0.0 to 1.0 */
  setProgress(fraction) {
    const clamped = Math.max(0, Math.min(1, fraction));
    this._fill.style.width = `${clamped * 100}%`;
  }

  /**
   * Fade out over 800ms, then remove from the DOM.
   * @returns {Promise<void>} resolves when the transition ends and the element is removed.
   */
  hide() {
    if (this._removed) return Promise.resolve();

    return new Promise((resolve) => {
      const onEnd = () => {
        this._root.removeEventListener('transitionend', onEnd);
        this._root.remove();
        this._styleEl.remove();
        this._removed = true;
        resolve();
      };

      this._root.addEventListener('transitionend', onEnd);
      this._root.style.opacity = '0';
    });
  }

  /** Show the loading screen (re-add to DOM if it was removed). */
  show() {
    if (this._removed) {
      this._removed = false;
      document.head.appendChild(this._styleEl);
      document.body.appendChild(this._root);
    }
    this._root.style.opacity = '1';
  }
}

// ─── CameraIntro ────────────────────────────────────────────────────────────

export class CameraIntro {
  /**
   * @param {object} opts
   * @param {object} opts.camera        — the Three.js camera (not directly used here but kept for reference)
   * @param {object} opts.zoomController — must expose `setViewSize(n)`
   */
  constructor({ camera, zoomController }) {
    this._camera = camera;
    this._zoom = zoomController;

    this._startSize = 35;
    this._endSize = 14;
    this._duration = 3; // seconds
    this._elapsed = 0;
    this._active = true;

    // Set the initial zoomed-out state
    this._zoom.setViewSize(this._startSize);
  }

  /**
   * Call once per frame.
   * @param {number} delta — time in seconds since last frame
   * @returns {boolean} `true` while the intro is still animating, `false` when done.
   */
  update(delta) {
    if (!this._active) return false;

    this._elapsed += delta;
    const t = Math.min(this._elapsed / this._duration, 1);

    // Exponential ease-out: 1 - e^(-k*t), normalised so it reaches ~1 at t=1.
    // k=5 gives a nice fast-start, gentle-finish curve.
    const k = 5;
    const eased = (1 - Math.exp(-k * t)) / (1 - Math.exp(-k));

    const viewSize = this._startSize + (this._endSize - this._startSize) * eased;
    this._zoom.setViewSize(viewSize);

    if (t >= 1) {
      this._zoom.setViewSize(this._endSize);
      this._active = false;
      return false;
    }

    return true;
  }
}
