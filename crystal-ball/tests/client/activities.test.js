// tests/client/activities.test.js
// Tests for phase-named activity palette and session activity mapping.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES,
  getActivityForGroup,
  getActivityForSession,
} from '../../public/js/activities.js';

const ALL_PHASES = ['coding', 'researching', 'planning', 'testing', 'reviewing', 'idle'];

describe('ACTIVITIES', () => {
  it('should have all 6 phase keys', () => {
    for (const phase of ALL_PHASES) {
      assert.ok(ACTIVITIES[phase], `missing activity for phase "${phase}"`);
    }
    assert.equal(Object.keys(ACTIVITIES).length, 6);
  });

  it('each entry should have energetic and passive with name and animate', () => {
    for (const phase of ALL_PHASES) {
      const entry = ACTIVITIES[phase];
      assert.equal(typeof entry.energetic.name, 'string', `${phase} energetic name`);
      assert.equal(typeof entry.energetic.animate, 'function', `${phase} energetic animate`);
      assert.equal(typeof entry.passive.name, 'string', `${phase} passive name`);
      assert.equal(typeof entry.passive.animate, 'function', `${phase} passive animate`);
    }
  });

  it('researching energetic should have controlsPosition', () => {
    assert.equal(ACTIVITIES.researching.energetic.controlsPosition, true);
  });

  it('researching passive should have controlsPosition', () => {
    assert.equal(ACTIVITIES.researching.passive.controlsPosition, true);
  });

  it('reviewing passive should have controlsPosition', () => {
    assert.equal(ACTIVITIES.reviewing.passive.controlsPosition, true);
  });

  it('coding should NOT have controlsPosition', () => {
    assert.ok(!ACTIVITIES.coding.energetic.controlsPosition);
    assert.ok(!ACTIVITIES.coding.passive.controlsPosition);
  });
});

describe('getActivityForGroup()', () => {
  it('should return an activity entry with energetic and passive', () => {
    const entry = getActivityForGroup(0);
    assert.ok(entry.energetic);
    assert.ok(entry.passive);
    assert.equal(typeof entry.energetic.name, 'string');
    assert.equal(typeof entry.energetic.animate, 'function');
  });

  it('should cycle through 6 activities deterministically', () => {
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      seen.add(getActivityForGroup(i));
    }
    assert.equal(seen.size, 6);
  });

  it('should wrap around for indices beyond 6', () => {
    const first = getActivityForGroup(0);
    const wrapped = getActivityForGroup(6);
    assert.equal(first, wrapped);
  });
});

describe('getActivityForSession()', () => {
  it('should return correct activity for each phase', () => {
    for (const phase of ALL_PHASES) {
      const entry = getActivityForSession(0, phase);
      assert.equal(entry, ACTIVITIES[phase]);
    }
  });

  it('should return different entries for different phases', () => {
    const coding = getActivityForSession(0, 'coding');
    const testing = getActivityForSession(0, 'testing');
    assert.notEqual(coding.energetic.name, testing.energetic.name);
  });

  it('should fall back to group activity for null phase', () => {
    const entry = getActivityForSession(0, null);
    const groupEntry = getActivityForGroup(0);
    assert.equal(entry, groupEntry);
  });

  it('should fall back to group activity for unknown phase', () => {
    const entry = getActivityForSession(0, 'hacking');
    const groupEntry = getActivityForGroup(0);
    assert.equal(entry, groupEntry);
  });
});
