// hud.js -- Top bar HUD updates.
// Reads session states from API data and updates the HUD stat counters.

/**
 * Format seconds into "Xm Ys" display string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatWaitTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Update the HUD bar with counts derived from the latest API data.
 * @param {{ sessions: Array<{ state: string }>, groups: object[], metrics?: object }} apiData
 */
export function updateHUD(apiData) {
  const sessions = apiData.sessions || [];

  // Count sessions by state
  let active = 0;
  let awaiting = 0;
  let idle = 0;
  let stale = 0;
  let blocked = 0;

  for (const s of sessions) {
    switch (s.state) {
      case 'active':   active++;   break;
      case 'awaiting': awaiting++; break;
      case 'idle':     idle++;     break;
      case 'stale':    stale++;    break;
      case 'blocked':  blocked++;  break;
    }
  }

  // Update DOM elements -- session counts
  const elSessions = document.getElementById('hud-sessions');
  const elActive   = document.getElementById('hud-active');
  const elAwaiting = document.getElementById('hud-awaiting');
  const elBlocked  = document.getElementById('hud-blocked');
  const elIdle     = document.getElementById('hud-idle');
  const elStale    = document.getElementById('hud-stale');

  if (elSessions) elSessions.textContent = sessions.length;
  if (elActive)   elActive.textContent   = active;
  if (elAwaiting) elAwaiting.textContent = awaiting;
  if (elBlocked)  elBlocked.textContent  = blocked;
  if (elIdle)     elIdle.textContent     = idle;
  if (elStale)    elStale.textContent    = stale;

  // Toggle awaiting-alert class on the awaiting stat container
  const awaitingStat = elAwaiting ? elAwaiting.closest('.hud-stat') : null;
  if (awaitingStat) {
    if (awaiting > 0) {
      awaitingStat.classList.add('awaiting-alert');
    } else {
      awaitingStat.classList.remove('awaiting-alert');
    }
  }

  // Toggle blocked-alert class on the blocked stat container
  const blockedStat = elBlocked ? elBlocked.closest('.hud-stat') : null;
  if (blockedStat) {
    if (blocked > 0) {
      blockedStat.classList.add('blocked-alert');
    } else {
      blockedStat.classList.remove('blocked-alert');
    }
  }

  // ── Idle economics metrics ────────────────────────────────────────────
  const metrics = apiData.metrics;
  const elAwaitMinutes = document.getElementById('hud-await-minutes');
  const elLongestWait  = document.getElementById('hud-longest-wait');

  if (elAwaitMinutes && metrics) {
    elAwaitMinutes.textContent = metrics.awaitingAgentMinutes.toFixed(1);
  }

  // ── Multi-person players count ───────────────────────────────────────
  const elPlayers = document.getElementById('hud-players');
  const playersStat = elPlayers ? elPlayers.closest('.hud-stat') : null;
  if (elPlayers && apiData.users) {
    elPlayers.textContent = apiData.users.length;
    if (playersStat) playersStat.style.display = '';
  } else if (playersStat) {
    playersStat.style.display = 'none';
  }

  if (elLongestWait && metrics) {
    const lw = metrics.longestWait;
    if (lw && lw.sessionId) {
      const name = lw.name || lw.sessionId;
      const group = lw.group ? ` (${lw.group})` : '';
      elLongestWait.textContent = `${name}${group} \u2014 ${formatWaitTime(lw.seconds)}`;
    } else {
      elLongestWait.textContent = '\u2014';
    }
  }
}
