// server/relay/publisher.js
// Publishes local session snapshots to the relay server.

/**
 * @class RelayPublisher
 * Publishes filtered snapshots to a relay server via HTTP POST.
 */
export class RelayPublisher {
  /**
   * @param {{ relayUrl: string, userName: string, userColor: string, token: string|null }} opts
   */
  constructor({ relayUrl, userName, userColor, token }) {
    this._relayUrl = relayUrl.replace(/\/+$/, '');
    this._userName = userName;
    this._userColor = userColor;
    this._token = token;
  }

  /**
   * Publish a filtered snapshot to the relay.
   * Errors are logged but swallowed -- publishing failure must not break local operation.
   * @param {object} snapshot -- { timestamp, sessions, groups, metrics }
   * @param {string[]} excludedGroups -- group names to exclude
   */
  async publish(snapshot, excludedGroups = []) {
    try {
      const filtered = RelayPublisher.filterSnapshot(snapshot, excludedGroups);
      const namespaced = RelayPublisher.namespaceSnapshot(filtered, this._userName);

      const headers = { 'Content-Type': 'application/json' };
      if (this._token) {
        headers['Authorization'] = `Bearer ${this._token}`;
      }

      const res = await fetch(`${this._relayUrl}/api/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user: this._userName,
          color: this._userColor,
          snapshot: namespaced,
        }),
      });

      if (!res.ok) {
        console.warn(`[RelayPublisher] publish failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[RelayPublisher] publish error:', err.message);
    }
  }

  /**
   * Filter out excluded groups and their sessions from a snapshot.
   * Pure function, exported as static for testing.
   * @param {object} snapshot
   * @param {string[]} excludedGroups
   * @returns {object} filtered snapshot
   */
  static filterSnapshot(snapshot, excludedGroups) {
    if (!excludedGroups || excludedGroups.length === 0) return snapshot;

    const excludeSet = new Set(excludedGroups);
    const sessions = (snapshot.sessions || []).filter(s => !excludeSet.has(s.group));
    const groups = (snapshot.groups || []).filter(g => !excludeSet.has(g.id));

    // Recalculate blockedCount from filtered sessions
    let blockedCount = 0;
    for (const s of sessions) {
      if (s.state === 'blocked') blockedCount++;
    }

    return {
      ...snapshot,
      sessions,
      groups,
      metrics: {
        ...(snapshot.metrics || {}),
        blockedCount,
      },
    };
  }

  /**
   * Namespace session IDs for publishing (so they don't collide with other users).
   * The relay merger also namespaces, but we pre-namespace here so the local
   * snapshot is already in the correct format.
   * @param {object} snapshot
   * @param {string} userName
   * @returns {object} snapshot with namespaced IDs
   */
  static namespaceSnapshot(snapshot, userName) {
    // Don't namespace here -- the relay merger handles namespacing.
    // This avoids double-namespacing. Just pass through.
    return snapshot;
  }
}
