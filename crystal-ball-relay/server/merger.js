// server/merger.js
// Merge multi-user snapshots into a single combined response. Pure function.

/**
 * Merge snapshots from multiple users into a combined API response.
 * @param {Array<{ user: string, color: string, snapshot: object }>} entries
 * @returns {object} Combined response
 */
export function mergeSnapshots(entries) {
  const sessions = [];
  const groupMap = new Map(); // groupName -> { cwd, sessionIds, owners }
  let totalAwaitingMinutes = 0;
  let totalBlockedCount = 0;
  let globalLongestWait = null;
  const users = [];

  for (const entry of entries) {
    const { user, color, snapshot } = entry;
    const snap = snapshot || {};

    users.push({
      name: user,
      color,
      sessionCount: (snap.sessions || []).length,
    });

    // Namespace and collect sessions
    for (const s of (snap.sessions || [])) {
      const namespacedId = `${user}/${s.id}`;
      sessions.push({
        ...s,
        id: namespacedId,
        owner: user,
        ownerColor: color,
      });

      // Build groups
      const groupName = s.group;
      if (groupName) {
        let g = groupMap.get(groupName);
        if (!g) {
          g = { cwd: s.cwd, sessionIds: [], owners: new Set() };
          groupMap.set(groupName, g);
        }
        g.sessionIds.push(namespacedId);
        g.owners.add(user);
      }
    }

    // Aggregate metrics
    const metrics = snap.metrics || {};
    totalAwaitingMinutes += metrics.awaitingAgentMinutes || 0;
    totalBlockedCount += metrics.blockedCount || 0;

    if (metrics.longestWait && metrics.longestWait.sessionId) {
      const wait = metrics.longestWait;
      if (!globalLongestWait || wait.seconds > globalLongestWait.seconds) {
        globalLongestWait = {
          ...wait,
          sessionId: `${user}/${wait.sessionId}`,
        };
      }
    }
  }

  // Build groups array
  const groups = [];
  for (const [name, g] of groupMap) {
    groups.push({
      id: name,
      cwd: g.cwd,
      session_count: g.sessionIds.length,
      session_ids: g.sessionIds,
      owners: [...g.owners],
    });
  }

  return {
    timestamp: new Date().toISOString(),
    sessions,
    groups,
    metrics: {
      awaitingAgentMinutes: Math.round(totalAwaitingMinutes * 10) / 10,
      longestWait: globalLongestWait,
      blockedCount: totalBlockedCount,
    },
    users,
  };
}
