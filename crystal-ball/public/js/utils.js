// utils.js -- Shared utility functions used across multiple client modules.

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Count sessions by state.
 * @param {Array<{state: string}>} sessions
 * @returns {{ active: number, awaiting: number, blocked: number, idle: number, stale: number }}
 */
export function countSessionStates(sessions) {
  const counts = { active: 0, awaiting: 0, blocked: 0, idle: 0, stale: 0 };
  for (const s of sessions) {
    if (counts[s.state] !== undefined) counts[s.state]++;
  }
  return counts;
}

/**
 * Format seconds to human-readable "Xh Ym Zs" string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatUptime(seconds) {
  if (seconds == null || seconds < 0) return '\u2014';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
