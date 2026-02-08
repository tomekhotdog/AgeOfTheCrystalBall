// server/store.js
// In-memory snapshot store with TTL expiry for the relay server.

export class RelayStore {
  /**
   * @param {number} expiryMs -- time in ms before a user's snapshot is considered stale
   */
  constructor(expiryMs = 30000) {
    this._expiryMs = expiryMs;
    /** @type {Map<string, { user: string, color: string, snapshot: object, receivedAt: number }>} */
    this._entries = new Map();
  }

  /**
   * Upsert a user's snapshot.
   * @param {string} userName
   * @param {string} color -- hex color string
   * @param {object} snapshot -- { timestamp, sessions, groups, metrics }
   */
  publish(userName, color, snapshot) {
    this._entries.set(userName, {
      user: userName,
      color,
      snapshot,
      receivedAt: Date.now(),
    });
  }

  /**
   * Return all non-expired entries.
   * @returns {Array<{ user: string, color: string, snapshot: object, receivedAt: number }>}
   */
  getAll() {
    const now = Date.now();
    const results = [];
    const expired = [];
    for (const [name, entry] of this._entries) {
      if (now - entry.receivedAt > this._expiryMs) {
        expired.push(name);
      } else {
        results.push(entry);
      }
    }
    // Cleanup expired
    for (const name of expired) {
      this._entries.delete(name);
    }
    return results;
  }

  /**
   * Return a list of online users with metadata.
   * @returns {Array<{ name: string, color: string, sessionCount: number, lastSeen: string }>}
   */
  getUserList() {
    const entries = this.getAll(); // also cleans expired
    return entries.map(e => ({
      name: e.user,
      color: e.color,
      sessionCount: e.snapshot.sessions ? e.snapshot.sessions.length : 0,
      lastSeen: new Date(e.receivedAt).toISOString(),
    }));
  }
}
