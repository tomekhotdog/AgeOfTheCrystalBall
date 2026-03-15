// server/discovery/common.js
// Shared process-discovery functions used by both macOS and Linux discovery modules.

/**
 * Parse ps output into structured records.
 * Expected format: `ps axo pid,ppid,pcpu,rss,tty,lstart,command`
 *
 * @param {string} stdout
 * @param {string[]} detachedTokens -- TTY values that mean "detached" (macOS: '??', Linux: '?', '??')
 * @returns {Array<{pid: number, ppid: number, cpu: number, rssKB: number, tty: string, lstart: string, command: string}>}
 */
export function parsePsOutput(stdout, detachedTokens = ['?', '??']) {
  const detachedSet = new Set(detachedTokens);
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return [];

  const results = [];
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Fields: PID PPID %CPU RSS TT LSTART(day month date time year) COMMAND
    // lstart has 5 tokens: e.g. "Thu Feb  6 14:30:00 2026"
    const parts = line.split(/\s+/);
    if (parts.length < 11) continue;

    const pid = parseInt(parts[0], 10);
    const ppid = parseInt(parts[1], 10);
    const cpu = parseFloat(parts[2]);
    const rssKB = parseInt(parts[3], 10);
    const tty = detachedSet.has(parts[4]) ? 'detached' : parts[4];
    // lstart: 5 tokens starting at index 5
    const lstart = parts.slice(5, 10).join(' ');
    const command = parts.slice(10).join(' ');

    if (isNaN(pid)) continue;

    results.push({ pid, ppid, cpu: isNaN(cpu) ? 0 : cpu, rssKB: isNaN(rssKB) ? 0 : rssKB, tty, lstart, command });
  }
  return results;
}

/**
 * Filter processes that look like Claude Code sessions.
 * @param {Array<{command: string}>} processes
 * @returns {Array} filtered
 */
export function filterClaudeProcesses(processes) {
  return processes.filter(p => {
    const cmd = p.command;
    return cmd === 'claude' ||
           cmd.includes('/claude') ||
           cmd.includes('@anthropic/claude-code') ||
           cmd.includes('claude-code');
  });
}

/**
 * Detect child processes: scan all processes for ppid matching Claude PIDs.
 * @param {Array<{pid: number, ppid: number}>} allProcesses
 * @param {Set<number>} claudePids
 * @returns {Set<number>} PIDs that have children
 */
export function detectChildren(allProcesses, claudePids) {
  const hasChildren = new Set();
  for (const p of allProcesses) {
    if (claudePids.has(p.ppid)) {
      hasChildren.add(p.ppid);
    }
  }
  return hasChildren;
}

/**
 * Build session output from discovered Claude processes.
 * @param {Array} claudeProcesses
 * @param {Set<number>} childParents
 * @param {Map<number, string>} cwdMap
 * @returns {Array}
 */
export function buildSessionOutput(claudeProcesses, childParents, cwdMap) {
  return claudeProcesses.map(p => {
    const startTime = new Date(p.lstart).getTime();
    return {
      pid: p.pid,
      cwd: cwdMap.get(p.pid) || '/unknown',
      cpu: p.cpu,
      memMB: Math.round(p.rssKB / 1024),
      tty: p.tty,
      hasChildren: childParents.has(p.pid),
      startTime: isNaN(startTime) ? Date.now() : startTime,
    };
  });
}
