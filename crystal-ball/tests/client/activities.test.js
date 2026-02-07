// tests/client/activities.test.js
// Tests for activity palette and phase-driven activity mapping.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_PAIRS,
  getActivityForGroup,
  PHASE_ACTIVITY_MAP,
  getActivityForSession,
} from '../../public/js/activities.js';

describe('getActivityForGroup()', () => {
  it('should return an activity pair with energetic and passive', () => {
    const pair = getActivityForGroup(0);
    assert.ok(pair.energetic);
    assert.ok(pair.passive);
    assert.equal(typeof pair.energetic.name, 'string');
    assert.equal(typeof pair.energetic.animate, 'function');
  });

  it('should cycle through pairs deterministically', () => {
    for (let i = 0; i < ACTIVITY_PAIRS.length; i++) {
      const pair = getActivityForGroup(i);
      assert.equal(pair, ACTIVITY_PAIRS[i]);
    }
  });

  it('should wrap around for indices beyond pair count', () => {
    const pair = getActivityForGroup(ACTIVITY_PAIRS.length);
    assert.equal(pair, ACTIVITY_PAIRS[0]);
  });
});

describe('PHASE_ACTIVITY_MAP', () => {
  it('should have entries for all 8 standard phases', () => {
    const phases = ['planning', 'researching', 'coding', 'testing', 'debugging', 'reviewing', 'documenting', 'idle'];
    for (const phase of phases) {
      assert.ok(PHASE_ACTIVITY_MAP[phase], `missing mapping for phase "${phase}"`);
      assert.ok(PHASE_ACTIVITY_MAP[phase].energetic);
      assert.ok(PHASE_ACTIVITY_MAP[phase].passive);
    }
  });
});

describe('getActivityForSession()', () => {
  it('should return phase-mapped pair for valid phase', () => {
    const pair = getActivityForSession(0, 'coding');
    assert.equal(pair.energetic.name, 'Building');
    assert.equal(pair.passive.name, 'Scribing');
  });

  it('should return different pair for different phases', () => {
    const coding = getActivityForSession(0, 'coding');
    const testing = getActivityForSession(0, 'testing');
    assert.notEqual(coding.energetic.name, testing.energetic.name);
  });

  it('should fall back to group activity for null phase', () => {
    const pair = getActivityForSession(0, null);
    const groupPair = getActivityForGroup(0);
    assert.equal(pair.energetic.name, groupPair.energetic.name);
  });

  it('should fall back to group activity for unknown phase', () => {
    const pair = getActivityForSession(0, 'hacking');
    const groupPair = getActivityForGroup(0);
    assert.equal(pair.energetic.name, groupPair.energetic.name);
  });

  it('should return Patrolling for researching phase', () => {
    const pair = getActivityForSession(0, 'researching');
    assert.equal(pair.energetic.name, 'Patrolling');
    assert.equal(pair.passive.name, 'Patrolling');
  });

  it('should return Scribing for planning phase', () => {
    const pair = getActivityForSession(0, 'planning');
    assert.equal(pair.energetic.name, 'Scribing');
  });

  it('should return Resting for idle phase', () => {
    const pair = getActivityForSession(0, 'idle');
    assert.equal(pair.energetic.name, 'Resting');
    assert.equal(pair.passive.name, 'Resting');
  });
});
