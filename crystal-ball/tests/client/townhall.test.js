// townhall.test.js — Unit tests for the Town Hall pure helper functions.
//
// The helpers under test (isFullDeployment, shouldTriggerVictory, victoryFade)
// are pure logic with no DOM or THREE.js dependency, but the module imports
// THREE at the top level, so we run via the three-mock-loader:
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/townhall.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isFullDeployment,
  shouldTriggerVictory,
  victoryFade,
} from '../../public/js/townhall.js';

// ---------------------------------------------------------------------------
// isFullDeployment
// ---------------------------------------------------------------------------

describe('isFullDeployment', () => {
  it('returns false for an empty array', () => {
    assert.equal(isFullDeployment([]), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(isFullDeployment(null), false);
    assert.equal(isFullDeployment(undefined), false);
  });

  it('returns true when all sessions are active', () => {
    const sessions = [
      { state: 'active' },
      { state: 'active' },
      { state: 'active' },
    ];
    assert.equal(isFullDeployment(sessions), true);
  });

  it('returns false when any session is not active', () => {
    const sessions = [
      { state: 'active' },
      { state: 'idle' },
      { state: 'active' },
    ];
    assert.equal(isFullDeployment(sessions), false);
  });

  it('returns false when all sessions are idle', () => {
    const sessions = [
      { state: 'idle' },
      { state: 'idle' },
    ];
    assert.equal(isFullDeployment(sessions), false);
  });

  it('returns true for a single active session', () => {
    assert.equal(isFullDeployment([{ state: 'active' }]), true);
  });

  it('returns false for a single awaiting session', () => {
    assert.equal(isFullDeployment([{ state: 'awaiting' }]), false);
  });

  it('returns false for mixed active and stale', () => {
    const sessions = [
      { state: 'active' },
      { state: 'stale' },
    ];
    assert.equal(isFullDeployment(sessions), false);
  });
});

// ---------------------------------------------------------------------------
// shouldTriggerVictory
// ---------------------------------------------------------------------------

describe('shouldTriggerVictory', () => {
  it('returns true on first trigger (lastTriggerTime === 0) when deployed', () => {
    assert.equal(shouldTriggerVictory(true, 0, 10000, 30000), true);
  });

  it('returns false when not deployed', () => {
    assert.equal(shouldTriggerVictory(false, 0, 10000, 30000), false);
  });

  it('returns false when within cooldown period', () => {
    const last = 10000;
    const now  = 10000 + 15000; // 15s later, cooldown is 30s
    assert.equal(shouldTriggerVictory(true, last, now, 30000), false);
  });

  it('returns true when cooldown has elapsed', () => {
    const last = 10000;
    const now  = 10000 + 31000; // 31s later, cooldown is 30s
    assert.equal(shouldTriggerVictory(true, last, now, 30000), true);
  });

  it('returns false at exactly the cooldown boundary', () => {
    const last = 10000;
    const now  = 10000 + 30000; // exactly 30s later
    assert.equal(shouldTriggerVictory(true, last, now, 30000), false);
  });

  it('returns false when not deployed even after cooldown', () => {
    const last = 10000;
    const now  = 10000 + 60000;
    assert.equal(shouldTriggerVictory(false, last, now, 30000), false);
  });

  it('works with cooldown of 0 (always triggers when deployed)', () => {
    // lastTriggerTime > 0, now === lastTriggerTime, cooldown 0
    // now - last = 0, which is NOT > 0, so false
    assert.equal(shouldTriggerVictory(true, 5000, 5000, 0), false);
    // But if even 1ms has passed:
    assert.equal(shouldTriggerVictory(true, 5000, 5001, 0), true);
  });
});

// ---------------------------------------------------------------------------
// victoryFade
// ---------------------------------------------------------------------------

describe('victoryFade', () => {
  it('returns 1.0 during display period', () => {
    assert.equal(victoryFade(0, 5000, 500), 1.0);
    assert.equal(victoryFade(2500, 5000, 500), 1.0);
    assert.equal(victoryFade(4999, 5000, 500), 1.0);
  });

  it('returns 1.0 at the start of fade (elapsed === displayDuration)', () => {
    // At exactly displayDuration the fadeElapsed is 0, so opacity = 1.0 - 0 = 1.0
    // But our function checks elapsed < displayDuration first, which is false.
    // Then fadeElapsed = 0, so 1.0 - (0/500) = 1.0
    assert.equal(victoryFade(5000, 5000, 500), 1.0);
  });

  it('returns ~0.5 at the midpoint of the fade', () => {
    // elapsed = 5250, displayDuration = 5000, fadeDuration = 500
    // fadeElapsed = 250, opacity = 1.0 - 250/500 = 0.5
    assert.equal(victoryFade(5250, 5000, 500), 0.5);
  });

  it('returns 0.0 after display + fade duration', () => {
    assert.equal(victoryFade(5500, 5000, 500), 0.0);
  });

  it('returns 0.0 well after total duration', () => {
    assert.equal(victoryFade(10000, 5000, 500), 0.0);
  });

  it('handles negative elapsed by returning 1.0', () => {
    assert.equal(victoryFade(-100, 5000, 500), 1.0);
  });

  it('handles fadeDuration of 0 (instant disappear)', () => {
    // During display
    assert.equal(victoryFade(3000, 5000, 0), 1.0);
    // At display end — fadeDuration is 0 so should be 0.0
    assert.equal(victoryFade(5000, 5000, 0), 0.0);
  });

  it('linearly interpolates through the fade range', () => {
    // displayDuration = 1000, fadeDuration = 1000
    // 25% through fade: elapsed = 1250
    const opacity = victoryFade(1250, 1000, 1000);
    assert.ok(Math.abs(opacity - 0.75) < 0.001, `expected ~0.75, got ${opacity}`);

    // 75% through fade: elapsed = 1750
    const opacity2 = victoryFade(1750, 1000, 1000);
    assert.ok(Math.abs(opacity2 - 0.25) < 0.001, `expected ~0.25, got ${opacity2}`);
  });
});
