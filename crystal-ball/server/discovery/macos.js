// server/discovery/macos.js
// Discovers real Claude Code processes on macOS via ps + lsof.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parsePsOutput, filterClaudeProcesses, detectChildren, buildSessionOutput } from './common.js';

const execFileAsync = promisify(execFile);

// Re-export pure functions for test compatibility
export { parsePsOutput, filterClaudeProcesses, detectChildren };

/**
 * Parse lsof output to extract cwd per PID.
 * lsof -a -p <pids> -d cwd -Fn outputs:
 *   p<pid>
 *   n<path>
 * @param {string} stdout
 * @returns {Map<number, string>} pid -> cwd
 */
export function parseLsofCwd(stdout) {
  const result = new Map();
  let currentPid = null;

  for (const line of stdout.trim().split('\n')) {
    if (line.startsWith('p')) {
      currentPid = parseInt(line.slice(1), 10);
    } else if (line.startsWith('n') && currentPid !== null) {
      result.set(currentPid, line.slice(1));
      currentPid = null;
    }
  }
  return result;
}

/**
 * macOS-specific discovery of Claude Code sessions.
 */
export class MacOSDiscovery {
  async discoverSessions() {
    try {
      // Get all processes
      const { stdout: psOut } = await execFileAsync('ps', ['axo', 'pid,ppid,pcpu,rss,tty,lstart,command'], { maxBuffer: 10 * 1024 * 1024 });
      const allProcesses = parsePsOutput(psOut, ['??']);
      const claudeProcesses = filterClaudeProcesses(allProcesses);

      if (claudeProcesses.length === 0) return [];

      const claudePids = new Set(claudeProcesses.map(p => p.pid));

      // Detect children
      const childParents = detectChildren(allProcesses, claudePids);

      // Get cwd for each Claude process
      const pidList = [...claudePids].join(',');
      let cwdMap = new Map();
      try {
        const { stdout: lsofOut } = await execFileAsync('lsof', ['-a', '-p', pidList, '-d', 'cwd', '-Fn'], { maxBuffer: 1024 * 1024 });
        cwdMap = parseLsofCwd(lsofOut);
      } catch {
        // lsof may fail for permission reasons; continue without cwd
      }

      return buildSessionOutput(claudeProcesses, childParents, cwdMap);
    } catch (err) {
      console.error('[MacOSDiscovery] Error:', err.message);
      return [];
    }
  }
}
