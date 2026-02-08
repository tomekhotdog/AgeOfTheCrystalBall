// doubleClick.test.js -- Unit tests for the double-click selection pure helpers.
//
// The pure functions under test (findAllOfClass, findAllInGroup, isDoubleClick)
// have no THREE.js dependency, but the module imports THREE at the top level,
// so we run via the three-mock-loader:
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/doubleClick.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findAllOfClass,
  findAllInGroup,
  isDoubleClick,
} from '../../public/js/doubleClick.js';

// ---------------------------------------------------------------------------
// findAllOfClass
// ---------------------------------------------------------------------------

describe('findAllOfClass', () => {
  it('returns empty array when no units match the target class', () => {
    const units = [
      { sessionId: 'a', unitClass: 'Researcher' },
      { sessionId: 'b', unitClass: 'Analyst' },
    ];
    const result = findAllOfClass('Engineer', units);
    assert.deepEqual(result, []);
  });

  it('returns matching sessionIds when some units match', () => {
    const units = [
      { sessionId: 'a', unitClass: 'Engineer' },
      { sessionId: 'b', unitClass: 'Researcher' },
      { sessionId: 'c', unitClass: 'Engineer' },
      { sessionId: 'd', unitClass: 'Security' },
    ];
    const result = findAllOfClass('Engineer', units);
    assert.deepEqual(result, ['a', 'c']);
  });

  it('returns all sessionIds when every unit matches', () => {
    const units = [
      { sessionId: 'x', unitClass: 'Analyst' },
      { sessionId: 'y', unitClass: 'Analyst' },
      { sessionId: 'z', unitClass: 'Analyst' },
    ];
    const result = findAllOfClass('Analyst', units);
    assert.deepEqual(result, ['x', 'y', 'z']);
  });

  it('returns empty array for an empty units array', () => {
    const result = findAllOfClass('Engineer', []);
    assert.deepEqual(result, []);
  });

  it('is case-sensitive -- "engineer" does not match "Engineer"', () => {
    const units = [
      { sessionId: 'a', unitClass: 'Engineer' },
    ];
    const result = findAllOfClass('engineer', units);
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// findAllInGroup
// ---------------------------------------------------------------------------

describe('findAllInGroup', () => {
  it('returns matching session IDs for a given group', () => {
    const sessions = [
      { id: 'a', group: 'g1' },
      { id: 'b', group: 'g2' },
      { id: 'c', group: 'g1' },
    ];
    const result = findAllInGroup('g1', sessions);
    assert.deepEqual(result, ['a', 'c']);
  });

  it('returns empty array when no sessions match the group', () => {
    const sessions = [
      { id: 'a', group: 'g1' },
      { id: 'b', group: 'g2' },
    ];
    const result = findAllInGroup('g99', sessions);
    assert.deepEqual(result, []);
  });

  it('returns all IDs when every session belongs to the group', () => {
    const sessions = [
      { id: 'x', group: 'alpha' },
      { id: 'y', group: 'alpha' },
    ];
    const result = findAllInGroup('alpha', sessions);
    assert.deepEqual(result, ['x', 'y']);
  });

  it('returns empty array for an empty sessions array', () => {
    const result = findAllInGroup('g1', []);
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// isDoubleClick
// ---------------------------------------------------------------------------

describe('isDoubleClick', () => {
  it('returns true when interval is within the default threshold', () => {
    // 200ms apart, default threshold 350ms
    assert.equal(isDoubleClick(1000, 1200), true);
  });

  it('returns false when interval exceeds the default threshold', () => {
    // 400ms apart, default threshold 350ms
    assert.equal(isDoubleClick(1000, 1400), false);
  });

  it('returns false when interval exactly equals the threshold', () => {
    // exactly 350ms -- not strictly less than, so false
    assert.equal(isDoubleClick(1000, 1350), false);
  });

  it('returns true when lastClickTime is 0 and now is small', () => {
    // 0 to 100 = 100ms, within 350ms threshold
    assert.equal(isDoubleClick(0, 100), true);
  });

  it('returns false when lastClickTime is 0 and now is large', () => {
    // 0 to 5000 = 5000ms, well outside threshold
    assert.equal(isDoubleClick(0, 5000), false);
  });

  it('uses custom threshold when provided', () => {
    // 150ms apart, custom threshold 100ms -- should be false
    assert.equal(isDoubleClick(1000, 1150, 100), false);
    // 50ms apart, custom threshold 100ms -- should be true
    assert.equal(isDoubleClick(1000, 1050, 100), true);
  });

  it('returns true for zero interval (simultaneous clicks)', () => {
    assert.equal(isDoubleClick(1000, 1000), true);
  });
});
