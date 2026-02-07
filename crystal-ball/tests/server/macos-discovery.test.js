// tests/server/macos-discovery.test.js
// Tests for macOS process discovery pure functions.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePsOutput, filterClaudeProcesses, detectChildren, parseLsofCwd } from '../../server/discovery/macos.js';

describe('parsePsOutput()', () => {
  const SAMPLE = `  PID  PPID  %CPU   RSS TT       STARTED                      COMMAND
  501     1   2.3 45000 ??       Thu Feb  6 14:30:00 2026 /usr/bin/node /home/user/.npm/bin/claude
  502   501   0.1  8000 ttys001  Thu Feb  6 14:31:00 2026 /bin/bash -c npm test
  503     1  15.0 90000 ttys002  Thu Feb  6 12:00:00 2026 /usr/local/bin/node /home/user/.nvm/versions/node/v20/bin/claude-code --session abc
  504     1   0.0  1000 ??       Thu Feb  6 10:00:00 2026 /sbin/launchd`;

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

  it('should map ?? tty to detached', () => {
    const result = parsePsOutput(SAMPLE);
    assert.equal(result[0].tty, 'detached');
    assert.equal(result[1].tty, 'ttys001');
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

describe('filterClaudeProcesses()', () => {
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

describe('detectChildren()', () => {
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

describe('parseLsofCwd()', () => {
  it('should extract pid to cwd mapping', () => {
    const input = `p501
n/home/user/projects/myapp
p502
n/home/user/projects/other`;
    const result = parseLsofCwd(input);
    assert.equal(result.get(501), '/home/user/projects/myapp');
    assert.equal(result.get(502), '/home/user/projects/other');
  });

  it('should handle empty input', () => {
    assert.equal(parseLsofCwd('').size, 0);
  });

  it('should handle single entry', () => {
    const result = parseLsofCwd('p123\n/home/user');
    // Second line doesn't start with 'n', so no entry
    assert.equal(result.size, 0);
  });

  it('should handle proper single entry', () => {
    const result = parseLsofCwd('p123\nn/home/user');
    assert.equal(result.get(123), '/home/user');
  });
});
