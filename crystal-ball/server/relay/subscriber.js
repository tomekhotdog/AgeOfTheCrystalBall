// server/relay/subscriber.js
// Fetches combined multi-user data from the relay server.

/**
 * @class RelaySubscriber
 * Fetches combined session data and user roster from the relay.
 */
export class RelaySubscriber {
  /**
   * @param {{ relayUrl: string, token: string|null }} opts
   */
  constructor({ relayUrl, token }) {
    this._relayUrl = relayUrl.replace(/\/+$/, '');
    this._token = token;
  }

  /**
   * Fetch the combined view from the relay.
   * @returns {Promise<object|null>} parsed JSON or null on error
   */
  async fetchCombined() {
    try {
      const headers = {};
      if (this._token) {
        headers['Authorization'] = `Bearer ${this._token}`;
      }

      const res = await fetch(`${this._relayUrl}/api/combined`, { headers });
      if (!res.ok) {
        console.warn(`[RelaySubscriber] combined fetch failed: HTTP ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn('[RelaySubscriber] combined fetch error:', err.message);
      return null;
    }
  }

  /**
   * Fetch the user roster from the relay.
   * @returns {Promise<object|null>}
   */
  async fetchUsers() {
    try {
      const headers = {};
      if (this._token) {
        headers['Authorization'] = `Bearer ${this._token}`;
      }

      const res = await fetch(`${this._relayUrl}/api/users`, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[RelaySubscriber] users fetch error:', err.message);
      return null;
    }
  }
}
