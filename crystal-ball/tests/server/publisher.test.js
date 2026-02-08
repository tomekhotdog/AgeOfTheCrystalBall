// tests/server/publisher.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RelayPublisher } from '../../server/relay/publisher.js';

describe('RelayPublisher.filterSnapshot', () => {
  const snapshot = {
    timestamp: 'now',
    sessions: [
      { id: 'claude-1', group: 'projA', state: 'active' },
      { id: 'claude-2', group: 'projB', state: 'blocked' },
      { id: 'claude-3', group: 'projA', state: 'idle' },
    ],
    groups: [
      { id: 'projA', session_count: 2 },
      { id: 'projB', session_count: 1 },
    ],
    metrics: { awaitingAgentMinutes: 5, blockedCount: 1, longestWait: null },
  };

  it('should pass through when no exclusions', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, []);
    assert.equal(result.sessions.length, 3);
    assert.equal(result.groups.length, 2);
  });

  it('should filter out excluded group sessions', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, ['projB']);
    assert.equal(result.sessions.length, 2);
    assert.ok(result.sessions.every(s => s.group === 'projA'));
  });

  it('should filter out excluded groups', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, ['projB']);
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].id, 'projA');
  });

  it('should recalculate blockedCount after filtering', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, ['projB']);
    assert.equal(result.metrics.blockedCount, 0); // the blocked session was in projB
  });

  it('should handle excluding all groups', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, ['projA', 'projB']);
    assert.equal(result.sessions.length, 0);
    assert.equal(result.groups.length, 0);
  });

  it('should handle excluding non-existent group', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, ['noSuchProj']);
    assert.equal(result.sessions.length, 3);
    assert.equal(result.groups.length, 2);
  });

  it('should preserve other metrics fields', () => {
    const result = RelayPublisher.filterSnapshot(snapshot, ['projB']);
    assert.equal(result.metrics.awaitingAgentMinutes, 5);
  });

  it('should handle snapshot with no sessions', () => {
    const empty = { timestamp: 'now', sessions: [], groups: [], metrics: { blockedCount: 0 } };
    const result = RelayPublisher.filterSnapshot(empty, ['projA']);
    assert.equal(result.sessions.length, 0);
  });
});
