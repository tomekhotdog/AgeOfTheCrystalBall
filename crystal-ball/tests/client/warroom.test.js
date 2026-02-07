// warroom.test.js — Unit tests for the War Room pure helper functions.
//
// The helpers under test (activityScore, sortedLeaderboard, detectTransitions)
// are pure logic with no DOM or THREE.js dependency, so no mock loader is needed.
// However we run via three-mock-loader for consistency with the test:client script.
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/warroom.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  activityScore,
  sortedLeaderboard,
  detectTransitions,
} from '../../public/js/warroom.js';

// ---------------------------------------------------------------------------
// activityScore
// ---------------------------------------------------------------------------

describe('activityScore', () => {
  it('returns 0 for empty sessions', () => {
    assert.equal(activityScore([]), 0);
  });

  it('returns 3 * count for all active sessions', () => {
    const sessions = [
      { state: 'active' },
      { state: 'active' },
      { state: 'active' },
    ];
    assert.equal(activityScore(sessions), 9);
  });

  it('computes correct mixed score', () => {
    // 2 active (6) + 1 awaiting (1) + 1 idle (0) + 1 stale (-1) = 6
    const sessions = [
      { state: 'active' },
      { state: 'active' },
      { state: 'awaiting' },
      { state: 'idle' },
      { state: 'stale' },
    ];
    assert.equal(activityScore(sessions), 6);
  });

  it('returns negative score for mostly stale sessions', () => {
    const sessions = [
      { state: 'stale' },
      { state: 'stale' },
      { state: 'stale' },
      { state: 'idle' },
    ];
    assert.equal(activityScore(sessions), -3);
  });

  it('returns 1 for a single awaiting session', () => {
    assert.equal(activityScore([{ state: 'awaiting' }]), 1);
  });

  it('treats unknown states as 0', () => {
    assert.equal(activityScore([{ state: 'unknown' }]), 0);
  });
});

// ---------------------------------------------------------------------------
// sortedLeaderboard
// ---------------------------------------------------------------------------

describe('sortedLeaderboard', () => {
  it('returns an empty array for no groups', () => {
    assert.deepEqual(sortedLeaderboard([]), []);
  });

  it('sorts groups by score descending', () => {
    const groups = [
      {
        id: 'low',
        sessions: [{ state: 'stale', cpu: 0 }, { state: 'stale', cpu: 0 }],
      },
      {
        id: 'high',
        sessions: [{ state: 'active', cpu: 50 }, { state: 'active', cpu: 70 }],
      },
      {
        id: 'mid',
        sessions: [{ state: 'awaiting', cpu: 10 }],
      },
    ];

    const result = sortedLeaderboard(groups);
    assert.equal(result.length, 3);
    assert.equal(result[0].id, 'high');
    assert.equal(result[1].id, 'mid');
    assert.equal(result[2].id, 'low');
  });

  it('computes unitCount, activeCount, and avgCpu correctly', () => {
    const groups = [
      {
        id: 'alpha',
        sessions: [
          { state: 'active', cpu: 40 },
          { state: 'idle', cpu: 10 },
          { state: 'active', cpu: 20 },
        ],
      },
    ];

    const result = sortedLeaderboard(groups);
    assert.equal(result[0].unitCount, 3);
    assert.equal(result[0].activeCount, 2);
    // avgCpu = (40 + 10 + 20) / 3 ≈ 23.333
    assert.ok(Math.abs(result[0].avgCpu - 23.333) < 0.01);
  });

  it('handles a group with empty sessions', () => {
    const groups = [
      { id: 'empty', sessions: [] },
      { id: 'one', sessions: [{ state: 'active', cpu: 5 }] },
    ];

    const result = sortedLeaderboard(groups);
    // 'one' should come first (score 3 > 0)
    assert.equal(result[0].id, 'one');
    assert.equal(result[1].id, 'empty');
    assert.equal(result[1].unitCount, 0);
    assert.equal(result[1].avgCpu, 0);
  });

  it('handles missing cpu values gracefully', () => {
    const groups = [
      { id: 'noCpu', sessions: [{ state: 'active' }, { state: 'idle' }] },
    ];

    const result = sortedLeaderboard(groups);
    assert.equal(result[0].avgCpu, 0);
    assert.equal(result[0].score, 3);
  });

  it('handles missing sessions array gracefully', () => {
    const groups = [
      { id: 'noSessions' },
    ];

    const result = sortedLeaderboard(groups);
    assert.equal(result[0].unitCount, 0);
    assert.equal(result[0].score, 0);
    assert.equal(result[0].avgCpu, 0);
  });
});

// ---------------------------------------------------------------------------
// detectTransitions
// ---------------------------------------------------------------------------

describe('detectTransitions', () => {
  it('returns empty array when nothing changed', () => {
    const prev = new Map([
      ['s1', 'active'],
      ['s2', 'idle'],
    ]);
    const current = [
      { id: 's1', state: 'active', group: 'g1' },
      { id: 's2', state: 'idle', group: 'g1' },
    ];
    const result = detectTransitions(prev, current);
    assert.equal(result.length, 0);
  });

  it('detects a state change', () => {
    const prev = new Map([['s1', 'idle']]);
    const current = [{ id: 's1', state: 'active', group: 'proj' }];
    const result = detectTransitions(prev, current);

    assert.equal(result.length, 1);
    assert.equal(result[0].sessionId, 's1');
    assert.equal(result[0].group, 'proj');
    assert.equal(result[0].fromState, 'idle');
    assert.equal(result[0].toState, 'active');
    assert.ok(result[0].time instanceof Date);
  });

  it('detects multiple simultaneous changes', () => {
    const prev = new Map([
      ['s1', 'active'],
      ['s2', 'awaiting'],
      ['s3', 'idle'],
    ]);
    const current = [
      { id: 's1', state: 'idle', group: 'g1' },
      { id: 's2', state: 'active', group: 'g1' },
      { id: 's3', state: 'idle', group: 'g2' },  // no change
    ];
    const result = detectTransitions(prev, current);
    assert.equal(result.length, 2);
    assert.equal(result[0].sessionId, 's1');
    assert.equal(result[1].sessionId, 's2');
  });

  it('treats new sessions as transition from "new"', () => {
    const prev = new Map();  // empty — first poll
    const current = [
      { id: 'brand-new', state: 'active', group: 'proj' },
    ];
    const result = detectTransitions(prev, current);

    assert.equal(result.length, 1);
    assert.equal(result[0].fromState, 'new');
    assert.equal(result[0].toState, 'active');
    assert.equal(result[0].sessionId, 'brand-new');
  });

  it('handles empty current sessions with non-empty prev', () => {
    const prev = new Map([['s1', 'active']]);
    const current = [];
    const result = detectTransitions(prev, current);
    // No transitions — disappeared sessions are not tracked as transitions
    assert.equal(result.length, 0);
  });

  it('ignores sessions with unchanged state even with different groups', () => {
    const prev = new Map([['s1', 'active']]);
    const current = [{ id: 's1', state: 'active', group: 'new-group' }];
    const result = detectTransitions(prev, current);
    assert.equal(result.length, 0);
  });

  it('returns entries with a Date time field', () => {
    const prev = new Map([['s1', 'idle']]);
    const current = [{ id: 's1', state: 'stale', group: 'g' }];
    const before = new Date();
    const result = detectTransitions(prev, current);
    const after = new Date();

    assert.ok(result[0].time >= before);
    assert.ok(result[0].time <= after);
  });
});
