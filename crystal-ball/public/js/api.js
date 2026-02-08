// api.js -- Fetch /api/sessions (or /api/combined in multi mode) on a timer
// and pass data to a callback. Detects mode from /api/mode on start.

export class ApiPoller {
  /**
   * @param {number} interval -- polling interval in milliseconds (default 2000)
   */
  constructor(interval = 2000) {
    this.interval = interval;
    this._timerId = null;
    /** @type {'local'|'multi'} */
    this._mode = 'local';
    /** @type {{ name: string, color: string }|null} */
    this._userInfo = null;
    /** @type {string|null} */
    this._endpoint = '/api/sessions';
  }

  /** Current mode: 'local' or 'multi'. */
  get mode() { return this._mode; }

  /** User identity info when in multi mode, null otherwise. */
  get userInfo() { return this._userInfo; }

  /**
   * Detect mode from the server, then begin polling.
   * @param {(data: object) => void} callback
   */
  async start(callback) {
    // Detect mode before first poll
    await this._detectMode();

    // Immediately fire the first request
    this._poll(callback);

    // Then set up the recurring timer
    this._timerId = setInterval(() => {
      this._poll(callback);
    }, this.interval);
  }

  /**
   * Stop polling.
   */
  stop() {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  /**
   * Fetch /api/mode to determine local vs multi-person mode.
   * Graceful degradation: if it fails, fall back to local-only.
   */
  async _detectMode() {
    try {
      const res = await fetch('/api/mode');
      if (res.ok) {
        const data = await res.json();
        this._mode = data.mode || 'local';
        this._userInfo = data.user || null;
        if (this._mode === 'multi') {
          this._endpoint = '/api/combined';
        }
      }
    } catch {
      // Old server or network issue -- stay in local mode
    }
  }

  /**
   * Internal fetch wrapper -- errors are logged and swallowed so the
   * polling loop continues uninterrupted.
   * @param {Function} callback
   */
  async _poll(callback) {
    try {
      const res = await fetch(this._endpoint);
      if (!res.ok) {
        console.warn(`[ApiPoller] HTTP ${res.status}: ${res.statusText}`);
        return;
      }
      const data = await res.json();
      callback(data);
    } catch (err) {
      console.error('[ApiPoller] fetch error:', err);
    }
  }
}

export default ApiPoller;
