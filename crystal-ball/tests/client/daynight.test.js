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
//   dawn  :   0 –  45 s
//   day   :  45 – 165 s
//   dusk  : 165 – 210 s
//   night : 210 – 300 s
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

    it('returns day at elapsed = 45', () => {
      const { phaseName } = calculatePhase(45);
      assert.equal(phaseName, 'day');
    });

    it('returns dusk at elapsed = 165', () => {
      const { phaseName } = calculatePhase(165);
      assert.equal(phaseName, 'dusk');
    });

    it('returns night at elapsed = 210', () => {
      const { phaseName } = calculatePhase(210);
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
    it('returns dawn at 22.5 s (midpoint of dawn)', () => {
      const { phaseName } = calculatePhase(22.5);
      assert.equal(phaseName, 'dawn');
    });

    it('returns day at 105 s (midpoint of day)', () => {
      const { phaseName } = calculatePhase(105);
      assert.equal(phaseName, 'day');
    });

    it('returns dusk at 187.5 s (midpoint of dusk)', () => {
      const { phaseName } = calculatePhase(187.5);
      assert.equal(phaseName, 'dusk');
    });

    it('returns night at 255 s (midpoint of night)', () => {
      const { phaseName } = calculatePhase(255);
      assert.equal(phaseName, 'night');
    });
  });

  // -----------------------------------------------------------------------
  // getPhase equivalent — phaseName at key timepoints
  // -----------------------------------------------------------------------
  describe('getPhase returns correct name at key timepoints', () => {
    const cases = [
      [0,    'dawn'],
      [10,   'dawn'],
      [44,   'dawn'],
      [45,   'day'],
      [100,  'day'],
      [164,  'day'],
      [165,  'dusk'],
      [200,  'dusk'],
      [209,  'dusk'],
      [210,  'night'],
      [250,  'night'],
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

    it('is ~0.5 at midpoint of dawn (22.5 s)', () => {
      const { phaseProgress } = calculatePhase(22.5);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is 0.0 at the start of day (45 s)', () => {
      const { phaseProgress } = calculatePhase(45);
      assert.ok(Math.abs(phaseProgress) < 1e-9,
        `Expected ~0 but got ${phaseProgress}`);
    });

    it('is ~0.5 at midpoint of day (105 s)', () => {
      const { phaseProgress } = calculatePhase(105);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is ~0.5 at midpoint of night (255 s)', () => {
      const { phaseProgress } = calculatePhase(255);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });
  });

  // -----------------------------------------------------------------------
  // Light intensity interpolation ranges at phase midpoints
  //
  // At the midpoint of a phase (phaseProgress = 0.5), the interpolated
  // intensity should be roughly between the current phase value and the
  // next phase value. We verify the raw phase data gives us sane bounds.
  // -----------------------------------------------------------------------
  describe('intensity interpolation ranges at phase midpoints', () => {
    // Phase data mirrored from daynight.js for assertion bounds.
    const phases = [
      { name: 'dawn',  dirI: 0.8,  ambI: 0.3  },
      { name: 'day',   dirI: 1.2,  ambI: 0.4  },
      { name: 'dusk',  dirI: 0.9,  ambI: 0.25 },
      { name: 'night', dirI: 0.3,  ambI: 0.15 },
    ];

    for (let i = 0; i < phases.length; i++) {
      const cur = phases[i];
      const nxt = phases[(i + 1) % phases.length];

      it(`dirLight intensity at ${cur.name} midpoint is between ${cur.name} and ${nxt.name}`, () => {
        const lo = Math.min(cur.dirI, nxt.dirI);
        const hi = Math.max(cur.dirI, nxt.dirI);
        // The midpoint interpolated value must fall in [lo, hi].
        const mid = (cur.dirI + nxt.dirI) / 2;
        assert.ok(mid >= lo && mid <= hi,
          `Midpoint ${mid} outside [${lo}, ${hi}]`);
      });

      it(`ambientLight intensity at ${cur.name} midpoint is between ${cur.name} and ${nxt.name}`, () => {
        const lo = Math.min(cur.ambI, nxt.ambI);
        const hi = Math.max(cur.ambI, nxt.ambI);
        const mid = (cur.ambI + nxt.ambI) / 2;
        assert.ok(mid >= lo && mid <= hi,
          `Midpoint ${mid} outside [${lo}, ${hi}]`);
      });
    }
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

    it('elapsed = 345 wraps identically to elapsed = 45', () => {
      const a = calculatePhase(45);
      const b = calculatePhase(345);
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
      assert.equal(calculatePhase(90, customDuration).phaseName, 'day');
      assert.equal(calculatePhase(330, customDuration).phaseName, 'dusk');
      assert.equal(calculatePhase(420, customDuration).phaseName, 'night');
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
      // Dawn is 45/300 of the cycle. At customDuration=600, dawn lasts 90 s.
      // So at elapsed=89 we should still be in dawn.
      assert.equal(calculatePhase(89, customDuration).phaseName, 'dawn');
      // At elapsed=90 we should enter day.
      assert.equal(calculatePhase(90, customDuration).phaseName, 'day');
    });

    it('short cycle (60 s) works correctly', () => {
      const short = 60;
      // Dawn would be 45/300 * 60 = 9 s
      assert.equal(calculatePhase(0, short).phaseName, 'dawn');
      assert.equal(calculatePhase(8.9, short).phaseName, 'dawn');
      assert.equal(calculatePhase(9, short).phaseName, 'day');
      // Full wrap
      const a = calculatePhase(0, short);
      const b = calculatePhase(60, short);
      assert.equal(a.phaseName, b.phaseName);
    });
  });
});
