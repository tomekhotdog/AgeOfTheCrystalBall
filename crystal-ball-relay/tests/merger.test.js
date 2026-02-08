// tests/merger.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSnapshots } from '../server/merger.js';

describe('mergeSnapshots', () => {
  it('should return empty result for empty input', () => {
    const result = mergeSnapshots([]);
    assert.equal(result.sessions.length, 0);
    assert.equal(result.groups.length, 0);
    assert.equal(result.users.length, 0);
    assert.equal(result.metrics.awaitingAgentMinutes, 0);
    assert.equal(result.metrics.blockedCount, 0);
    assert.equal(result.metrics.longestWait, null);
  });

  it('should namespace session IDs with user name', () => {
    const entries = [{
      user: 'Alice',
      color: '#FF0000',
      snapshot: {
        sessions: [{ id: 'claude-123', group: 'proj', cwd: '/a', state: 'active' }],
        groups: [],
        metrics: {},
      },
    }];
    const result = mergeSnapshots(entries);
    assert.equal(result.sessions[0].id, 'Alice/claude-123');
    assert.equal(result.sessions[0].owner, 'Alice');
    assert.equal(result.sessions[0].ownerColor, '#FF0000');
  });

  it('should merge groups by name across users', () => {
    const entries = [
      {
        user: 'Alice',
        color: '#FF0000',
        snapshot: {
          sessions: [{ id: 'claude-1', group: 'myproj', cwd: '/a/myproj', state: 'active' }],
          groups: [],
          metrics: {},
        },
      },
      {
        user: 'Bob',
        color: '#00FF00',
        snapshot: {
          sessions: [{ id: 'claude-2', group: 'myproj', cwd: '/b/myproj', state: 'idle' }],
          groups: [],
          metrics: {},
        },
      },
    ];
    const result = mergeSnapshots(entries);
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].id, 'myproj');
    assert.equal(result.groups[0].session_count, 2);
    assert.deepStrictEqual(result.groups[0].owners.sort(), ['Alice', 'Bob']);
    assert.deepStrictEqual(result.groups[0].session_ids.sort(), ['Alice/claude-1', 'Bob/claude-2']);
  });

  it('should keep different group names separate', () => {
    const entries = [
      {
        user: 'Alice',
        color: '#FF0000',
        snapshot: {
          sessions: [{ id: 'claude-1', group: 'projA', cwd: '/a', state: 'active' }],
          groups: [],
          metrics: {},
        },
      },
      {
        user: 'Bob',
        color: '#00FF00',
        snapshot: {
          sessions: [{ id: 'claude-2', group: 'projB', cwd: '/b', state: 'idle' }],
          groups: [],
          metrics: {},
        },
      },
    ];
    const result = mergeSnapshots(entries);
    assert.equal(result.groups.length, 2);
  });

  it('should sum metrics across users', () => {
    const entries = [
      {
        user: 'Alice',
        color: '#FF0000',
        snapshot: {
          sessions: [],
          groups: [],
          metrics: { awaitingAgentMinutes: 5.5, blockedCount: 2, longestWait: null },
        },
      },
      {
        user: 'Bob',
        color: '#00FF00',
        snapshot: {
          sessions: [],
          groups: [],
          metrics: { awaitingAgentMinutes: 3.2, blockedCount: 1, longestWait: null },
        },
      },
    ];
    const result = mergeSnapshots(entries);
    assert.equal(result.metrics.awaitingAgentMinutes, 8.7);
    assert.equal(result.metrics.blockedCount, 3);
  });

  it('should pick globally longest wait', () => {
    const entries = [
      {
        user: 'Alice',
        color: '#FF0000',
        snapshot: {
          sessions: [],
          groups: [],
          metrics: {
            awaitingAgentMinutes: 0,
            blockedCount: 0,
            longestWait: { sessionId: 'claude-1', name: 'Aldric', group: 'proj', seconds: 120 },
          },
        },
      },
      {
        user: 'Bob',
        color: '#00FF00',
        snapshot: {
          sessions: [],
          groups: [],
          metrics: {
            awaitingAgentMinutes: 0,
            blockedCount: 0,
            longestWait: { sessionId: 'claude-2', name: 'Bronwyn', group: 'proj', seconds: 300 },
          },
        },
      },
    ];
    const result = mergeSnapshots(entries);
    assert.equal(result.metrics.longestWait.seconds, 300);
    assert.equal(result.metrics.longestWait.sessionId, 'Bob/claude-2');
  });

  it('should add owner and ownerColor to all sessions', () => {
    const entries = [{
      user: 'Alice',
      color: '#AABBCC',
      snapshot: {
        sessions: [
          { id: 'claude-1', group: 'p', cwd: '/', state: 'active' },
          { id: 'claude-2', group: 'p', cwd: '/', state: 'idle' },
        ],
        groups: [],
        metrics: {},
      },
    }];
    const result = mergeSnapshots(entries);
    for (const s of result.sessions) {
      assert.equal(s.owner, 'Alice');
      assert.equal(s.ownerColor, '#AABBCC');
    }
  });

  it('should build users array', () => {
    const entries = [
      { user: 'Alice', color: '#FF0000', snapshot: { sessions: [{ id: 'a', group: 'p', cwd: '/' }], groups: [], metrics: {} } },
      { user: 'Bob', color: '#00FF00', snapshot: { sessions: [], groups: [], metrics: {} } },
    ];
    const result = mergeSnapshots(entries);
    assert.equal(result.users.length, 2);
    assert.equal(result.users[0].name, 'Alice');
    assert.equal(result.users[0].sessionCount, 1);
    assert.equal(result.users[1].name, 'Bob');
    assert.equal(result.users[1].sessionCount, 0);
  });

  it('should handle single user', () => {
    const entries = [{
      user: 'Alice',
      color: '#FF0000',
      snapshot: {
        sessions: [{ id: 'claude-1', group: 'proj', cwd: '/x', state: 'active' }],
        groups: [{ id: 'proj', cwd: '/x', session_count: 1, session_ids: ['claude-1'] }],
        metrics: { awaitingAgentMinutes: 1.0, blockedCount: 0, longestWait: null },
      },
    }];
    const result = mergeSnapshots(entries);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.groups.length, 1);
    assert.equal(result.users.length, 1);
  });

  it('should handle missing snapshot fields gracefully', () => {
    const entries = [{ user: 'Alice', color: '#FF0000', snapshot: {} }];
    const result = mergeSnapshots(entries);
    assert.equal(result.sessions.length, 0);
    assert.equal(result.groups.length, 0);
  });

  it('should handle null snapshot', () => {
    const entries = [{ user: 'Alice', color: '#FF0000', snapshot: null }];
    const result = mergeSnapshots(entries);
    assert.equal(result.sessions.length, 0);
  });

  it('should preserve all original session fields', () => {
    const entries = [{
      user: 'Alice',
      color: '#FF0000',
      snapshot: {
        sessions: [{
          id: 'claude-1', pid: 123, group: 'proj', cwd: '/x',
          state: 'active', cpu: 50, mem: 200, age_seconds: 300,
          tty: '/dev/ttys001', has_children: true, mode: 2,
          context: { phase: 'coding', task: 'implement feature' },
        }],
        groups: [],
        metrics: {},
      },
    }];
    const result = mergeSnapshots(entries);
    const s = result.sessions[0];
    assert.equal(s.pid, 123);
    assert.equal(s.cpu, 50);
    assert.equal(s.mode, 2);
    assert.equal(s.context.phase, 'coding');
  });
});
