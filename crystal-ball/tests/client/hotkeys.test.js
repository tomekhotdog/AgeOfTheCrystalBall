// hotkeys.test.js — Unit tests for the keyboard hotkeys pure helper functions.
//
// The helpers under test (findMostUrgent, findAllAwaiting, getNthGroup,
// averagePosition) are pure logic with no THREE.js dependency.  However the
// module does import THREE at the class level, so we run via three-mock-loader:
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/hotkeys.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findMostUrgent,
  findAllAwaiting,
  getNthGroup,
  averagePosition,
} from '../../public/js/hotkeys.js';

// ---------------------------------------------------------------------------
// findMostUrgent
// ---------------------------------------------------------------------------

describe('findMostUrgent', () => {
  it('returns null for an empty array', () => {
    assert.equal(findMostUrgent([]), null);
  });

  it('returns null when no sessions are awaiting', () => {
    const sessions = [
      { state: 'active', age_seconds: 500 },
      { state: 'idle',   age_seconds: 1200 },
      { state: 'stale',  age_seconds: 3000 },
    ];
    assert.equal(findMostUrgent(sessions), null);
  });

  it('returns the session with the highest age_seconds among awaiting ones', () => {
    const sessions = [
      { id: 'a', state: 'awaiting', age_seconds: 100 },
      { id: 'b', state: 'awaiting', age_seconds: 500 },
      { id: 'c', state: 'awaiting', age_seconds: 250 },
    ];
    const result = findMostUrgent(sessions);
    assert.equal(result.id, 'b');
    assert.equal(result.age_seconds, 500);
  });

  it('ignores non-awaiting sessions even with higher age', () => {
    const sessions = [
      { id: 'x', state: 'active',   age_seconds: 9999 },
      { id: 'y', state: 'awaiting', age_seconds: 42 },
    ];
    const result = findMostUrgent(sessions);
    assert.equal(result.id, 'y');
    assert.equal(result.age_seconds, 42);
  });

  it('returns the single awaiting session when there is exactly one', () => {
    const sessions = [
      { id: 'only', state: 'awaiting', age_seconds: 7 },
    ];
    const result = findMostUrgent(sessions);
    assert.equal(result.id, 'only');
  });

  it('returns the first encountered when two have the same max age', () => {
    const sessions = [
      { id: 'first',  state: 'awaiting', age_seconds: 300 },
      { id: 'second', state: 'awaiting', age_seconds: 300 },
    ];
    const result = findMostUrgent(sessions);
    // Implementation iterates forward, so "first" keeps its position
    assert.equal(result.id, 'first');
  });
});

// ---------------------------------------------------------------------------
// findAllAwaiting
// ---------------------------------------------------------------------------

describe('findAllAwaiting', () => {
  it('returns an empty array for no sessions', () => {
    const result = findAllAwaiting([]);
    assert.deepEqual(result, []);
  });

  it('returns only awaiting sessions', () => {
    const sessions = [
      { id: 'a', state: 'active' },
      { id: 'b', state: 'awaiting' },
      { id: 'c', state: 'idle' },
      { id: 'd', state: 'awaiting' },
    ];
    const result = findAllAwaiting(sessions);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'b');
    assert.equal(result[1].id, 'd');
  });

  it('returns empty when none are awaiting', () => {
    const sessions = [
      { id: 'a', state: 'active' },
      { id: 'b', state: 'stale' },
    ];
    const result = findAllAwaiting(sessions);
    assert.deepEqual(result, []);
  });

  it('returns all sessions when every one is awaiting', () => {
    const sessions = [
      { id: 'x', state: 'awaiting' },
      { id: 'y', state: 'awaiting' },
    ];
    const result = findAllAwaiting(sessions);
    assert.equal(result.length, 2);
  });
});

// ---------------------------------------------------------------------------
// getNthGroup
// ---------------------------------------------------------------------------

describe('getNthGroup', () => {
  const groups = [
    { id: 'alpha' },
    { id: 'bravo' },
    { id: 'charlie' },
  ];

  it('returns the correct group id for index 0', () => {
    assert.equal(getNthGroup(groups, 0), 'alpha');
  });

  it('returns the correct group id for the last index', () => {
    assert.equal(getNthGroup(groups, 2), 'charlie');
  });

  it('returns null for an out-of-bounds positive index', () => {
    assert.equal(getNthGroup(groups, 5), null);
  });

  it('returns null for a negative index', () => {
    assert.equal(getNthGroup(groups, -1), null);
  });

  it('returns null for an empty groups array', () => {
    assert.equal(getNthGroup([], 0), null);
  });
});

// ---------------------------------------------------------------------------
// averagePosition
// ---------------------------------------------------------------------------

describe('averagePosition', () => {
  it('returns null for an empty array', () => {
    assert.equal(averagePosition([]), null);
  });

  it('returns the single position for one element', () => {
    const result = averagePosition([{ x: 5, z: 10 }]);
    assert.deepEqual(result, { x: 5, z: 10 });
  });

  it('returns the average for multiple positions', () => {
    const result = averagePosition([
      { x: 0, z: 0 },
      { x: 10, z: 20 },
    ]);
    assert.deepEqual(result, { x: 5, z: 10 });
  });

  it('computes average correctly for three positions', () => {
    const result = averagePosition([
      { x: 3, z: 6 },
      { x: 6, z: 9 },
      { x: 12, z: 0 },
    ]);
    assert.equal(result.x, 7);
    assert.equal(result.z, 5);
  });

  it('handles negative coordinates', () => {
    const result = averagePosition([
      { x: -10, z: -20 },
      { x: 10, z: 20 },
    ]);
    assert.deepEqual(result, { x: 0, z: 0 });
  });

  it('handles mixed positive and negative coordinates', () => {
    const result = averagePosition([
      { x: -5, z: 3 },
      { x: 5, z: -3 },
      { x: 0, z: 0 },
    ]);
    assert.ok(Math.abs(result.x - 0) < 1e-10);
    assert.ok(Math.abs(result.z - 0) < 1e-10);
  });

  it('handles fractional coordinates precisely', () => {
    const result = averagePosition([
      { x: 1.5, z: 2.5 },
      { x: 3.5, z: 4.5 },
    ]);
    assert.equal(result.x, 2.5);
    assert.equal(result.z, 3.5);
  });
});
