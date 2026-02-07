// api.js — Fetch /api/sessions on a timer and pass data to a callback.

export class ApiPoller {
  /**
   * @param {number} interval — polling interval in milliseconds (default 2000)
   */
  constructor(interval = 2000) {
    this.interval = interval;
    this._timerId = null;
  }

  /**
   * Begin polling. Calls `callback` with the parsed JSON from /api/sessions
   * on each successful fetch.
   * @param {(data: { timestamp: string, sessions: object[], groups: object[] }) => void} callback
   */
  start(callback) {
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
   * Internal fetch wrapper — errors are logged and swallowed so the
   * polling loop continues uninterrupted.
   * @param {Function} callback
   */
  async _poll(callback) {
    try {
      const res = await fetch('/api/sessions');
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
