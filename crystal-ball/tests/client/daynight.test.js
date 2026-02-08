// daynight.test.js — Unit tests for the day/night cycle phase logic.
//
// We import only the pure `calculatePhase` function so the tests run in
// plain Node.js without any Three.js dependency.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// calculatePhase is a pure function exported from daynight.js — no THREE
// dependency, so we can import it directly.
import { calculatePhase } from '../../public/js/daynight.js';

// ---------------------------------------------------------------------------
// Phase layout (default 300 s cycle):
//   dawn  :   0 –  15 s
//   day   :  15 – 225 s
//   dusk  : 225 – 240 s
//   night : 240 – 300 s
// ---------------------------------------------------------------------------

describe('calculatePhase', () => {
  // -----------------------------------------------------------------------
  // Phase identification at key boundaries
  // -----------------------------------------------------------------------
  describe('phase identification at boundaries', () => {
    it('returns dawn at elapsed = 0', () => {
      const { phaseName } = calculatePhase(0);
      assert.equal(phaseName, 'dawn');
    });

    it('returns day at elapsed = 15', () => {
      const { phaseName } = calculatePhase(15);
      assert.equal(phaseName, 'day');
    });

    it('returns dusk at elapsed = 225', () => {
      const { phaseName } = calculatePhase(225);
      assert.equal(phaseName, 'dusk');
    });

    it('returns night at elapsed = 240', () => {
      const { phaseName } = calculatePhase(240);
      assert.equal(phaseName, 'night');
    });

    it('wraps to dawn after a full 300 s cycle', () => {
      const { phaseName } = calculatePhase(300);
      assert.equal(phaseName, 'dawn');
    });
  });

  // -----------------------------------------------------------------------
  // Mid-phase identification
  // -----------------------------------------------------------------------
  describe('phase identification at midpoints', () => {
    it('returns dawn at 7.5 s (midpoint of dawn)', () => {
      const { phaseName } = calculatePhase(7.5);
      assert.equal(phaseName, 'dawn');
    });

    it('returns day at 120 s (midpoint of day)', () => {
      const { phaseName } = calculatePhase(120);
      assert.equal(phaseName, 'day');
    });

    it('returns dusk at 232.5 s (midpoint of dusk)', () => {
      const { phaseName } = calculatePhase(232.5);
      assert.equal(phaseName, 'dusk');
    });

    it('returns night at 270 s (midpoint of night)', () => {
      const { phaseName } = calculatePhase(270);
      assert.equal(phaseName, 'night');
    });
  });

  // -----------------------------------------------------------------------
  // getPhase equivalent — phaseName at key timepoints
  // -----------------------------------------------------------------------
  describe('getPhase returns correct name at key timepoints', () => {
    const cases = [
      [0,    'dawn'],
      [7,    'dawn'],
      [14,   'dawn'],
      [15,   'day'],
      [100,  'day'],
      [224,  'day'],
      [225,  'dusk'],
      [232,  'dusk'],
      [239,  'dusk'],
      [240,  'night'],
      [270,  'night'],
      [299,  'night'],
    ];

    for (const [elapsed, expected] of cases) {
      it(`elapsed=${elapsed}s => ${expected}`, () => {
        assert.equal(calculatePhase(elapsed).phaseName, expected);
      });
    }
  });

  // -----------------------------------------------------------------------
  // cycleProgress (0.0 – 1.0)
  // -----------------------------------------------------------------------
  describe('getCycleProgress', () => {
    it('returns 0 at the start of the cycle', () => {
      const { cycleProgress } = calculatePhase(0);
      assert.equal(cycleProgress, 0);
    });

    it('returns 0.5 at the halfway point (150 s)', () => {
      const { cycleProgress } = calculatePhase(150);
      assert.ok(Math.abs(cycleProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${cycleProgress}`);
    });

    it('returns close to 1.0 just before the cycle ends', () => {
      const { cycleProgress } = calculatePhase(299.9);
      assert.ok(cycleProgress > 0.99 && cycleProgress < 1.0,
        `Expected >0.99 but got ${cycleProgress}`);
    });

    it('wraps back to ~0 at exactly 300 s', () => {
      const { cycleProgress } = calculatePhase(300);
      assert.ok(cycleProgress < 0.01,
        `Expected ~0 (wrapped) but got ${cycleProgress}`);
    });
  });

  // -----------------------------------------------------------------------
  // phaseProgress (0.0 – 1.0 within each phase)
  // -----------------------------------------------------------------------
  describe('phaseProgress within a phase', () => {
    it('is 0.0 at the start of dawn', () => {
      const { phaseProgress } = calculatePhase(0);
      assert.equal(phaseProgress, 0);
    });

    it('is ~0.5 at midpoint of dawn (7.5 s)', () => {
      const { phaseProgress } = calculatePhase(7.5);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is 0.0 at the start of day (15 s)', () => {
      const { phaseProgress } = calculatePhase(15);
      assert.ok(Math.abs(phaseProgress) < 1e-9,
        `Expected ~0 but got ${phaseProgress}`);
    });

    it('is ~0.5 at midpoint of day (120 s)', () => {
      const { phaseProgress } = calculatePhase(120);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is ~0.5 at midpoint of night (270 s)', () => {
      const { phaseProgress } = calculatePhase(270);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });
  });

  // -----------------------------------------------------------------------
  // Cycle wrapping
  // -----------------------------------------------------------------------
  describe('cycle wrapping', () => {
    it('elapsed = 300 wraps identically to elapsed = 0', () => {
      const a = calculatePhase(0);
      const b = calculatePhase(300);
      assert.equal(a.phaseName, b.phaseName);
      assert.equal(a.phaseIndex, b.phaseIndex);
      assert.ok(Math.abs(a.phaseProgress - b.phaseProgress) < 1e-9);
    });

    it('elapsed = 315 wraps identically to elapsed = 15', () => {
      const a = calculatePhase(15);
      const b = calculatePhase(315);
      assert.equal(a.phaseName, b.phaseName);
      assert.equal(a.phaseIndex, b.phaseIndex);
      assert.ok(Math.abs(a.phaseProgress - b.phaseProgress) < 1e-9);
    });

    it('large elapsed values wrap correctly (3000 s = 10 full cycles)', () => {
      const a = calculatePhase(0);
      const b = calculatePhase(3000);
      assert.equal(a.phaseName, b.phaseName);
      assert.ok(Math.abs(a.cycleProgress - b.cycleProgress) < 1e-9);
    });

    it('negative elapsed wraps correctly', () => {
      // -60 s should be equivalent to 240 s (300 - 60).
      const a = calculatePhase(240);
      const b = calculatePhase(-60);
      assert.equal(a.phaseName, b.phaseName);
      assert.ok(Math.abs(a.phaseProgress - b.phaseProgress) < 1e-9);
    });
  });

  // -----------------------------------------------------------------------
  // Custom cycleDuration
  // -----------------------------------------------------------------------
  describe('custom cycleDuration', () => {
    const customDuration = 600; // twice as long

    it('phases still occur in the same order', () => {
      assert.equal(calculatePhase(0, customDuration).phaseName, 'dawn');
      assert.equal(calculatePhase(30, customDuration).phaseName, 'day');
      assert.equal(calculatePhase(450, customDuration).phaseName, 'dusk');
      assert.equal(calculatePhase(480, customDuration).phaseName, 'night');
    });

    it('cycle wraps at customDuration', () => {
      const a = calculatePhase(0, customDuration);
      const b = calculatePhase(customDuration, customDuration);
      assert.equal(a.phaseName, b.phaseName);
      assert.ok(Math.abs(a.phaseProgress - b.phaseProgress) < 1e-9);
    });

    it('cycleProgress is 0.5 at half the custom duration', () => {
      const { cycleProgress } = calculatePhase(300, customDuration);
      assert.ok(Math.abs(cycleProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${cycleProgress}`);
    });

    it('phase durations scale proportionally', () => {
      // Dawn is 15/300 of the cycle. At customDuration=600, dawn lasts 30 s.
      // So at elapsed=29 we should still be in dawn.
      assert.equal(calculatePhase(29, customDuration).phaseName, 'dawn');
      // At elapsed=30 we should enter day.
      assert.equal(calculatePhase(30, customDuration).phaseName, 'day');
    });

    it('short cycle (60 s) works correctly', () => {
      const short = 60;
      // Dawn would be 15/300 * 60 = 3 s
      assert.equal(calculatePhase(0, short).phaseName, 'dawn');
      assert.equal(calculatePhase(2.9, short).phaseName, 'dawn');
      assert.equal(calculatePhase(3, short).phaseName, 'day');
      // Full wrap
      const a = calculatePhase(0, short);
      const b = calculatePhase(60, short);
      assert.equal(a.phaseName, b.phaseName);
    });
  });
});
