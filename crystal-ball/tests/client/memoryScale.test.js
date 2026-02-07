// memoryScale.test.js — Unit tests for the memory-based size scaling pure helpers.
//
// The pure functions under test (scaleFromMemory, lerpScale) have no THREE.js
// dependency, but the module imports THREE at the top level, so we run via
// the three-mock-loader:
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/memoryScale.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scaleFromMemory, lerpScale } from '../../public/js/memoryScale.js';

// ---------------------------------------------------------------------------
// scaleFromMemory
// ---------------------------------------------------------------------------

describe('scaleFromMemory', () => {
  it('returns 0.9 for 0 MB', () => {
    assert.equal(scaleFromMemory(0), 0.9);
  });

  it('returns 0.9 for 99 MB (just below first threshold)', () => {
    assert.equal(scaleFromMemory(99), 0.9);
  });

  it('returns 1.0 for exactly 100 MB', () => {
    assert.equal(scaleFromMemory(100), 1.0);
  });

  it('returns 1.0 for 200 MB (mid-range of 100-300)', () => {
    assert.equal(scaleFromMemory(200), 1.0);
  });

  it('returns 1.0 for 299 MB (just below 300 threshold)', () => {
    assert.equal(scaleFromMemory(299), 1.0);
  });

  it('returns 1.1 for exactly 300 MB', () => {
    assert.equal(scaleFromMemory(300), 1.1);
  });

  it('returns 1.1 for 499 MB (just below 500 threshold)', () => {
    assert.equal(scaleFromMemory(499), 1.1);
  });

  it('returns 1.2 for exactly 500 MB', () => {
    assert.equal(scaleFromMemory(500), 1.2);
  });

  it('returns 1.2 for 1000 MB (well above 500)', () => {
    assert.equal(scaleFromMemory(1000), 1.2);
  });

  it('returns 0.9 for negative memory (edge case)', () => {
    assert.equal(scaleFromMemory(-10), 0.9);
  });
});

// ---------------------------------------------------------------------------
// lerpScale
// ---------------------------------------------------------------------------

describe('lerpScale', () => {
  it('snaps to target when difference is within 0.001', () => {
    // current=1.0005, target=1.0 — difference is 0.0005 after lerp
    const result = lerpScale(1.0005, 1.0, 0.016);
    assert.equal(result, 1.0);
  });

  it('interpolates midway for a moderate delta', () => {
    // current=0.9, target=1.1, delta=0.25, speed=2.0
    // step = (1.1 - 0.9) * min(1, 0.25 * 2) = 0.2 * 0.5 = 0.1
    // new = 0.9 + 0.1 = 1.0
    const result = lerpScale(0.9, 1.1, 0.25, 2.0);
    assert.ok(Math.abs(result - 1.0) < 1e-10);
  });

  it('returns current when delta is 0 (no time elapsed) and not near target', () => {
    // step = (1.2 - 0.9) * min(1, 0 * 2) = 0.3 * 0 = 0
    // new = 0.9, diff from target = 0.3 > 0.001 so no snap
    const result = lerpScale(0.9, 1.2, 0);
    assert.equal(result, 0.9);
  });

  it('snaps when delta is 0 but current is already close to target', () => {
    // current=1.0004, target=1.0, delta=0, step=0, new=1.0004
    // diff = 0.0004 < 0.001 -> snaps to 1.0
    const result = lerpScale(1.0004, 1.0, 0);
    assert.equal(result, 1.0);
  });

  it('reaches target in one step when delta * speed >= 1', () => {
    // delta=1.0, speed=2.0 -> min(1, 2.0) = 1
    // step = (1.2 - 0.9) * 1 = 0.3
    // new = 0.9 + 0.3 = 1.2 -> snaps (diff=0)
    const result = lerpScale(0.9, 1.2, 1.0, 2.0);
    assert.equal(result, 1.2);
  });

  it('returns target when current equals target', () => {
    const result = lerpScale(1.0, 1.0, 0.016);
    assert.equal(result, 1.0);
  });

  it('works for decreasing scale (target < current)', () => {
    // current=1.2, target=0.9, delta=0.25, speed=2.0
    // step = (0.9 - 1.2) * min(1, 0.5) = -0.3 * 0.5 = -0.15
    // new = 1.2 - 0.15 = 1.05
    const result = lerpScale(1.2, 0.9, 0.25, 2.0);
    assert.ok(Math.abs(result - 1.05) < 1e-10);
  });

  it('uses default speed of 2.0 when speed is not provided', () => {
    // current=0.9, target=1.0, delta=0.5
    // step = (1.0 - 0.9) * min(1, 0.5 * 2) = 0.1 * 1.0 = 0.1
    // new = 0.9 + 0.1 = 1.0
    const result = lerpScale(0.9, 1.0, 0.5);
    assert.equal(result, 1.0);
  });

  it('handles very large delta by clamping step factor to 1', () => {
    // delta=100, speed=2.0 -> min(1, 200) = 1
    // jumps directly to target
    const result = lerpScale(0.5, 1.5, 100, 2.0);
    assert.equal(result, 1.5);
  });
});
