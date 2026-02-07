// marchIn.test.js — Tests for the marchIn module's pure helper functions.
//
// The pure functions (computeEdgeSpawn, marchProgress, gravestoneFade) have
// no THREE.js dependency, so they can be tested directly. The MarchInManager
// class uses THREE and is not tested here.
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/marchIn.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEdgeSpawn,
  marchProgress,
  gravestoneFade,
} from '../../public/js/marchIn.js';

// ===========================================================================
// computeEdgeSpawn
// ===========================================================================

describe('computeEdgeSpawn', () => {
  // Grid: -14 to +13 (gridSize = 28)

  it('spawns from left edge when target is closest to x=-14', () => {
    const result = computeEdgeSpawn(-10, 0);
    assert.equal(result.x, -14);
    assert.equal(result.z, 0);
  });

  it('spawns from right edge when target is closest to x=+13', () => {
    const result = computeEdgeSpawn(9, 0);
    assert.equal(result.x, 13);
    assert.equal(result.z, 0);
  });

  it('spawns from top edge when target is closest to z=-14', () => {
    const result = computeEdgeSpawn(0, -10);
    assert.equal(result.x, 0);
    assert.equal(result.z, -14);
  });

  it('spawns from bottom edge when target is closest to z=+13', () => {
    const result = computeEdgeSpawn(0, 9);
    assert.equal(result.x, 0);
    assert.equal(result.z, 13);
  });

  it('handles center point — picks nearest edge (right wins tie for origin)', () => {
    // From (0, 0): distLeft=14, distRight=13, distTop=14, distBottom=13
    // min is 13 (distRight and distBottom). distRight checked first.
    const result = computeEdgeSpawn(0, 0);
    assert.equal(result.x, 13);
    assert.equal(result.z, 0);
  });

  it('handles point at (-0.5, -0.5) — equidistant left and top, left wins', () => {
    // distLeft = abs(-0.5 - (-14)) = 13.5
    // distRight = abs(-0.5 - 13) = 13.5
    // distTop = abs(-0.5 - (-14)) = 13.5
    // distBottom = abs(-0.5 - 13) = 13.5
    // All equal; left wins by tie-break order.
    const result = computeEdgeSpawn(-0.5, -0.5);
    assert.equal(result.x, -14);
    assert.equal(result.z, -0.5);
  });

  it('handles point at top-left corner (-14, -14)', () => {
    // distLeft = 0, distTop = 0 — left edge wins tie
    const result = computeEdgeSpawn(-14, -14);
    assert.equal(result.x, -14);
    assert.equal(result.z, -14);
  });

  it('handles point at bottom-right corner (13, 13)', () => {
    // distRight = 0, distBottom = 0 — right edge wins tie
    const result = computeEdgeSpawn(13, 13);
    assert.equal(result.x, 13);
    assert.equal(result.z, 13);
  });

  it('handles point at top-right corner (13, -14)', () => {
    // distRight = 0, distTop = 0 — right edge wins tie
    const result = computeEdgeSpawn(13, -14);
    assert.equal(result.x, 13);
    assert.equal(result.z, -14);
  });

  it('handles point at bottom-left corner (-14, 13)', () => {
    // distLeft = 0, distBottom = 0 — left edge wins tie
    const result = computeEdgeSpawn(-14, 13);
    assert.equal(result.x, -14);
    assert.equal(result.z, 13);
  });

  it('preserves the non-edge coordinate', () => {
    // Target near left edge — z should be preserved exactly
    const result = computeEdgeSpawn(-11, 5.5);
    assert.equal(result.x, -14);
    assert.equal(result.z, 5.5);
  });

  it('works with a custom grid size', () => {
    // gridSize = 10: edges at -5 and +4
    const result = computeEdgeSpawn(-4, 0, 10);
    assert.equal(result.x, -5);
    assert.equal(result.z, 0);
  });
});

// ===========================================================================
// marchProgress
// ===========================================================================

describe('marchProgress', () => {
  it('returns 0 at the start (elapsed = 0)', () => {
    assert.equal(marchProgress(0, 2.0), 0);
  });

  it('returns 1 at the end (elapsed = duration)', () => {
    assert.equal(marchProgress(2.0, 2.0), 1);
  });

  it('returns 1 when elapsed exceeds duration (overshoot)', () => {
    assert.equal(marchProgress(5.0, 2.0), 1);
  });

  it('returns 0 when elapsed is negative', () => {
    assert.equal(marchProgress(-1.0, 2.0), 0);
  });

  it('applies easeOutQuad at the midpoint (t=0.5)', () => {
    // t = 0.5, easeOutQuad = 0.5 * (2 - 0.5) = 0.75
    const result = marchProgress(1.0, 2.0);
    assert.ok(Math.abs(result - 0.75) < 1e-10,
      `expected 0.75, got ${result}`);
  });

  it('applies easeOutQuad at t=0.25', () => {
    // t = 0.25, easeOutQuad = 0.25 * (2 - 0.25) = 0.4375
    const result = marchProgress(0.5, 2.0);
    assert.ok(Math.abs(result - 0.4375) < 1e-10,
      `expected 0.4375, got ${result}`);
  });

  it('progress is always >= linear progress (easeOutQuad is faster early)', () => {
    // easeOutQuad should be >= linear for all t in (0, 1)
    for (let i = 1; i < 10; i++) {
      const elapsed = (i / 10) * 2.0;
      const t = i / 10;
      const eased = marchProgress(elapsed, 2.0);
      assert.ok(eased >= t - 1e-10,
        `at t=${t}, eased ${eased} should be >= linear ${t}`);
    }
  });

  it('handles zero duration gracefully', () => {
    assert.equal(marchProgress(0, 0), 1);
  });
});

// ===========================================================================
// gravestoneFade
// ===========================================================================

describe('gravestoneFade', () => {
  it('returns 1.0 at the very start (elapsed = 0)', () => {
    assert.equal(gravestoneFade(0, 60), 1.0);
  });

  it('returns 1.0 during the hold period (first 10%)', () => {
    // Hold period for 60s is first 6 seconds
    assert.equal(gravestoneFade(3.0, 60), 1.0);
    assert.equal(gravestoneFade(5.99, 60), 1.0);
  });

  it('returns 1.0 at the exact end of the hold period', () => {
    assert.equal(gravestoneFade(6.0, 60), 1.0);
  });

  it('starts fading immediately after the hold period', () => {
    // Just past the hold period — should be less than 1.0
    const opacity = gravestoneFade(6.01, 60);
    assert.ok(opacity < 1.0, `expected < 1.0, got ${opacity}`);
    assert.ok(opacity > 0.99, `expected close to 1.0, got ${opacity}`);
  });

  it('fades linearly to approximately 0.5 at the midpoint of the fade', () => {
    // Hold ends at 6s. Fade duration is 54s. Midpoint of fade: 6 + 27 = 33
    const opacity = gravestoneFade(33, 60);
    assert.ok(Math.abs(opacity - 0.5) < 0.01,
      `expected ~0.5, got ${opacity}`);
  });

  it('returns 0.0 at elapsed = totalDuration', () => {
    assert.equal(gravestoneFade(60, 60), 0);
  });

  it('returns 0.0 when elapsed exceeds totalDuration (overshoot)', () => {
    assert.equal(gravestoneFade(100, 60), 0);
  });

  it('returns 1.0 for negative elapsed', () => {
    assert.equal(gravestoneFade(-5, 60), 1.0);
  });

  it('handles zero duration gracefully', () => {
    assert.equal(gravestoneFade(0, 0), 0);
  });

  it('handles short duration correctly', () => {
    // Duration = 10, hold = 1s, fade = 9s
    assert.equal(gravestoneFade(0.5, 10), 1.0);   // in hold
    assert.equal(gravestoneFade(10, 10), 0);       // fully faded

    // At midpoint of fade (1 + 4.5 = 5.5)
    const opacity = gravestoneFade(5.5, 10);
    assert.ok(Math.abs(opacity - 0.5) < 0.01,
      `expected ~0.5, got ${opacity}`);
  });
});
