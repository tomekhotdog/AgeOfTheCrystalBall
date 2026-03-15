// server/discovery/linux.js
// Discovers real Claude Code processes on Linux via ps + /proc.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readlink } from 'node:fs/promises';
import { parsePsOutput, filterClaudeProcesses, detectChildren, buildSessionOutput } from './common.js';

const execFileAsync = promisify(execFile);

// Re-export pure functions for test compatibility
export { parsePsOutput, filterClaudeProcesses, detectChildren };

/**
 * Read the cwd of each PID via /proc/<pid>/cwd symlink.
 * Falls back gracefully on permission errors or vanished processes.
 * @param {number[]} pids
 * @returns {Promise<Map<number, string>>} pid -> cwd
 */
export async function readProcCwds(pids) {
  const result = new Map();
  await Promise.all(pids.map(async (pid) => {
    try {
      const cwd = await readlink(`/proc/${pid}/cwd`);
      result.set(pid, cwd);
    } catch {
      // permission denied or process already gone
    }
  }));
  return result;
}

/**
 * Linux-specific discovery of Claude Code sessions.
 */
export class LinuxDiscovery {
  async discoverSessions() {
    try {
      // Get all processes
      const { stdout: psOut } = await execFileAsync('ps', ['axo', 'pid,ppid,pcpu,rss,tty,lstart,command'], { maxBuffer: 10 * 1024 * 1024 });
      const allProcesses = parsePsOutput(psOut, ['?', '??']);
      const claudeProcesses = filterClaudeProcesses(allProcesses);

      if (claudeProcesses.length === 0) return [];

      const claudePids = new Set(claudeProcesses.map(p => p.pid));

      // Detect children
      const childParents = detectChildren(allProcesses, claudePids);

      // Get cwd for each Claude process via /proc
      const cwdMap = await readProcCwds([...claudePids]);

      return buildSessionOutput(claudeProcesses, childParents, cwdMap);
    } catch (err) {
      console.error('[LinuxDiscovery] Error:', err.message);
      return [];
    }
  }
}
