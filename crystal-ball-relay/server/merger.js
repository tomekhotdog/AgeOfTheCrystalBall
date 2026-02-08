// server/merger.js
// Merge multi-user snapshots into a single combined response. Pure function.

// 8 maximally-distinct player colours (~45deg hue spacing, S 65-70%, L 50-55%).
export const DISTINCT_PALETTE = [
  '#3070E0', // blue
  '#E03838', // red
  '#28C850', // green
  '#E8B010', // gold
  '#E028A0', // magenta
  '#18C0C0', // teal
  '#F08020', // orange
  '#9030E0', // purple
];

/**
 * When 2+ users are present, assign each a colour from DISTINCT_PALETTE
 * (alphabetical order for stability). Single-user keeps their original colour.
 * @param {Array<{ user: string }>} entries
 * @returns {Map<string,string>|null} user->color map, or null if no override needed
 */
export function assignDistinctColors(entries) {
  if (entries.length <= 1) return null;
  const sorted = [...new Set(entries.map(e => e.user))].sort();
  const colorMap = new Map();
  sorted.forEach((user, i) => {
    colorMap.set(user, DISTINCT_PALETTE[i % DISTINCT_PALETTE.length]);
  });
  return colorMap;
}

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

  // Assign distinct colours when multiple users are present
  const colorOverrides = assignDistinctColors(entries);

  for (const entry of entries) {
    const { user, color, snapshot } = entry;
    const snap = snapshot || {};
    const resolvedColor = colorOverrides ? colorOverrides.get(user) : color;

    users.push({
      name: user,
      color: resolvedColor,
      sessionCount: (snap.sessions || []).length,
    });

    // Namespace and collect sessions
    for (const s of (snap.sessions || [])) {
      const namespacedId = `${user}/${s.id}`;
      sessions.push({
        ...s,
        id: namespacedId,
        owner: user,
        ownerColor: resolvedColor,
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
