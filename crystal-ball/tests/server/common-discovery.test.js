// tests/server/common-discovery.test.js
// Tests for shared discovery functions in server/discovery/common.js.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePsOutput, filterClaudeProcesses, detectChildren, buildSessionOutput } from '../../server/discovery/common.js';

describe('common.parsePsOutput()', () => {
  const SAMPLE = `  PID  PPID  %CPU   RSS TT       STARTED                      COMMAND
  501     1   2.3 45000 ??       Thu Feb  6 14:30:00 2026 /usr/bin/node /home/user/.npm/bin/claude
  502   501   0.1  8000 ttys001  Thu Feb  6 14:31:00 2026 /bin/bash -c npm test`;

  it('should use default detachedTokens (? and ??)', () => {
    const result = parsePsOutput(SAMPLE);
    assert.equal(result[0].tty, 'detached');  // ?? matches default
    assert.equal(result[1].tty, 'ttys001');
  });

  it('should respect custom detachedTokens', () => {
    const result = parsePsOutput(SAMPLE, ['??']);
    assert.equal(result[0].tty, 'detached');
  });

  it('should handle Linux-style ? detached', () => {
    const linuxSample = `  PID  PPID  %CPU   RSS TT       STARTED                      COMMAND
  100     1   0.5  2000 ?        Thu Feb  6 10:00:00 2026 /bin/node claude`;
    const result = parsePsOutput(linuxSample, ['?', '??']);
    assert.equal(result[0].tty, 'detached');
  });
});

describe('common.filterClaudeProcesses()', () => {
  it('should match exact command "claude"', () => {
    const result = filterClaudeProcesses([{ pid: 1, command: 'claude' }]);
    assert.equal(result.length, 1);
  });

  it('should match command containing /claude', () => {
    const result = filterClaudeProcesses([{ pid: 1, command: '/usr/bin/claude' }]);
    assert.equal(result.length, 1);
  });

  it('should match @anthropic/claude-code', () => {
    const result = filterClaudeProcesses([{ pid: 1, command: 'node @anthropic/claude-code/cli.js' }]);
    assert.equal(result.length, 1);
  });

  it('should not match unrelated commands', () => {
    const result = filterClaudeProcesses([{ pid: 1, command: '/bin/bash' }]);
    assert.equal(result.length, 0);
  });
});

describe('common.detectChildren()', () => {
  it('should find parent PIDs that have children', () => {
    const all = [
      { pid: 100, ppid: 1 },
      { pid: 101, ppid: 100 },
    ];
    const claudePids = new Set([100]);
    const result = detectChildren(all, claudePids);
    assert.ok(result.has(100));
  });

  it('should not report PIDs without children', () => {
    const all = [{ pid: 100, ppid: 1 }];
    const claudePids = new Set([100]);
    assert.equal(detectChildren(all, claudePids).size, 0);
  });
});

describe('common.buildSessionOutput()', () => {
  it('should build session objects from process data', () => {
    const processes = [{
      pid: 501,
      cpu: 2.3,
      rssKB: 45000,
      tty: 'ttys001',
      lstart: 'Thu Feb  6 14:30:00 2026',
    }];
    const childParents = new Set([501]);
    const cwdMap = new Map([[501, '/home/user/project']]);

    const result = buildSessionOutput(processes, childParents, cwdMap);
    assert.equal(result.length, 1);
    assert.equal(result[0].pid, 501);
    assert.equal(result[0].cwd, '/home/user/project');
    assert.equal(result[0].cpu, 2.3);
    assert.equal(result[0].memMB, 44);  // Math.round(45000/1024)
    assert.equal(result[0].hasChildren, true);
    assert.ok(typeof result[0].startTime === 'number');
  });

  it('should default cwd to /unknown when not in cwdMap', () => {
    const result = buildSessionOutput(
      [{ pid: 1, cpu: 0, rssKB: 0, tty: '?', lstart: '' }],
      new Set(),
      new Map(),
    );
    assert.equal(result[0].cwd, '/unknown');
  });
});
