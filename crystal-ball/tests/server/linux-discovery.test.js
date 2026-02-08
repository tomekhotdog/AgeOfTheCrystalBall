// tests/server/linux-discovery.test.js
// Tests for Linux process discovery pure functions.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePsOutput, filterClaudeProcesses, detectChildren, readProcCwds } from '../../server/discovery/linux.js';

describe('Linux parsePsOutput()', () => {
  // Linux ps uses '?' for detached (not '??' like macOS)
  const SAMPLE = `  PID  PPID  %CPU   RSS TT       STARTED                      COMMAND
  501     1   2.3 45000 ?        Thu Feb  6 14:30:00 2026 /usr/bin/node /home/user/.npm/bin/claude
  502   501   0.1  8000 pts/1    Thu Feb  6 14:31:00 2026 /bin/bash -c npm test
  503     1  15.0 90000 pts/2    Thu Feb  6 12:00:00 2026 /usr/local/bin/node /home/user/.nvm/versions/node/v20/bin/claude-code --session abc
  504     1   0.0  1000 ?        Thu Feb  6 10:00:00 2026 /sbin/init`;

  it('should parse all data rows', () => {
    const result = parsePsOutput(SAMPLE);
    assert.equal(result.length, 4);
  });

  it('should extract pid, ppid, cpu, rssKB correctly', () => {
    const result = parsePsOutput(SAMPLE);
    assert.equal(result[0].pid, 501);
    assert.equal(result[0].ppid, 1);
    assert.equal(result[0].cpu, 2.3);
    assert.equal(result[0].rssKB, 45000);
  });

  it('should map ? tty to detached (Linux style)', () => {
    const result = parsePsOutput(SAMPLE);
    assert.equal(result[0].tty, 'detached');
    assert.equal(result[3].tty, 'detached');
  });

  it('should keep pts/* tty values', () => {
    const result = parsePsOutput(SAMPLE);
    assert.equal(result[1].tty, 'pts/1');
    assert.equal(result[2].tty, 'pts/2');
  });

  it('should also accept ?? as detached (macOS compat)', () => {
    const input = `  PID  PPID  %CPU   RSS TT       STARTED                      COMMAND
  100     1   0.0  1000 ??       Thu Feb  6 10:00:00 2026 /bin/bash`;
    const result = parsePsOutput(input);
    assert.equal(result[0].tty, 'detached');
  });

  it('should extract full command string', () => {
    const result = parsePsOutput(SAMPLE);
    assert.ok(result[0].command.includes('/claude'));
  });

  it('should handle empty input', () => {
    assert.deepEqual(parsePsOutput(''), []);
    assert.deepEqual(parsePsOutput('  PID  PPID  %CPU\n'), []);
  });

  it('should skip malformed lines', () => {
    const input = `  PID  PPID  %CPU   RSS TT       STARTED                      COMMAND
bad line`;
    const result = parsePsOutput(input);
    assert.equal(result.length, 0);
  });
});

describe('Linux filterClaudeProcesses()', () => {
  it('should keep processes with /claude in command', () => {
    const procs = [
      { pid: 1, command: '/usr/bin/node /home/user/.npm/bin/claude' },
      { pid: 2, command: '/bin/bash' },
      { pid: 3, command: 'node @anthropic/claude-code/cli.js' },
    ];
    const result = filterClaudeProcesses(procs);
    assert.equal(result.length, 2);
    assert.equal(result[0].pid, 1);
    assert.equal(result[1].pid, 3);
  });

  it('should return empty for no matches', () => {
    const procs = [{ pid: 1, command: '/bin/bash' }];
    assert.deepEqual(filterClaudeProcesses(procs), []);
  });

  it('should match claude-code in command', () => {
    const procs = [{ pid: 1, command: '/usr/local/bin/claude-code --help' }];
    assert.equal(filterClaudeProcesses(procs).length, 1);
  });
});

describe('Linux detectChildren()', () => {
  it('should find PIDs that have children', () => {
    const all = [
      { pid: 100, ppid: 1 },
      { pid: 101, ppid: 100 },
      { pid: 102, ppid: 100 },
      { pid: 200, ppid: 1 },
    ];
    const claudePids = new Set([100, 200]);
    const result = detectChildren(all, claudePids);
    assert.ok(result.has(100));
    assert.ok(!result.has(200));
  });

  it('should return empty set when no children', () => {
    const all = [{ pid: 100, ppid: 1 }];
    const claudePids = new Set([100]);
    assert.equal(detectChildren(all, claudePids).size, 0);
  });
});

describe('readProcCwds()', () => {
  it('should return empty map for empty pid list', async () => {
    const result = await readProcCwds([]);
    assert.equal(result.size, 0);
  });

  it('should gracefully handle non-existent PIDs', async () => {
    // PID 999999999 almost certainly doesn't exist
    const result = await readProcCwds([999999999]);
    assert.equal(result.size, 0);
  });
});
