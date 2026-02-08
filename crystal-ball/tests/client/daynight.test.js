// daynight.test.js — Unit tests for the UTC-based day/night cycle phase logic.
//
// We import only the pure `calculatePhase` function so the tests run in
// plain Node.js without any Three.js dependency.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePhase } from '../../public/js/daynight.js';

// ---------------------------------------------------------------------------
// UTC schedule:
//   dawn  : 08:30 – 09:00 (510 – 540 min)
//   day   : 09:00 – 18:00 (540 – 1080 min)
//   dusk  : 18:00 – 18:30 (1080 – 1110 min)
//   night : 18:30 – 08:30 (1110 – 510 min, wraps midnight)
// ---------------------------------------------------------------------------

describe('calculatePhase (UTC business hours)', () => {
  // -----------------------------------------------------------------------
  // Phase identification at key boundaries
  // -----------------------------------------------------------------------
  describe('phase identification at boundaries', () => {
    it('returns dawn at 08:30 (510 min)', () => {
      assert.equal(calculatePhase(510).phaseName, 'dawn');
    });

    it('returns day at 09:00 (540 min)', () => {
      assert.equal(calculatePhase(540).phaseName, 'day');
    });

    it('returns dusk at 18:00 (1080 min)', () => {
      assert.equal(calculatePhase(1080).phaseName, 'dusk');
    });

    it('returns night at 18:30 (1110 min)', () => {
      assert.equal(calculatePhase(1110).phaseName, 'night');
    });

    it('returns night at midnight (0 min)', () => {
      assert.equal(calculatePhase(0).phaseName, 'night');
    });

    it('returns night just before dawn at 08:29 (509 min)', () => {
      assert.equal(calculatePhase(509).phaseName, 'night');
    });
  });

  // -----------------------------------------------------------------------
  // Mid-phase identification
  // -----------------------------------------------------------------------
  describe('phase identification at midpoints', () => {
    it('returns dawn at 08:45 (525 min)', () => {
      assert.equal(calculatePhase(525).phaseName, 'dawn');
    });

    it('returns day at 13:30 (810 min)', () => {
      assert.equal(calculatePhase(810).phaseName, 'day');
    });

    it('returns dusk at 18:15 (1095 min)', () => {
      assert.equal(calculatePhase(1095).phaseName, 'dusk');
    });

    it('returns night at 03:00 (180 min)', () => {
      assert.equal(calculatePhase(180).phaseName, 'night');
    });

    it('returns night at 23:00 (1380 min)', () => {
      assert.equal(calculatePhase(1380).phaseName, 'night');
    });
  });

  // -----------------------------------------------------------------------
  // Comprehensive time-to-phase mapping
  // -----------------------------------------------------------------------
  describe('time-to-phase mapping', () => {
    const cases = [
      [0,    'night'],   // 00:00
      [180,  'night'],   // 03:00
      [480,  'night'],   // 08:00
      [509,  'night'],   // 08:29
      [510,  'dawn'],    // 08:30
      [520,  'dawn'],    // 08:40
      [539,  'dawn'],    // 08:59
      [540,  'day'],     // 09:00
      [720,  'day'],     // 12:00
      [1079, 'day'],     // 17:59
      [1080, 'dusk'],    // 18:00
      [1095, 'dusk'],    // 18:15
      [1109, 'dusk'],    // 18:29
      [1110, 'night'],   // 18:30
      [1200, 'night'],   // 20:00
      [1439, 'night'],   // 23:59
    ];

    for (const [minutes, expected] of cases) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      it(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (${minutes} min) => ${expected}`, () => {
        assert.equal(calculatePhase(minutes).phaseName, expected);
      });
    }
  });

  // -----------------------------------------------------------------------
  // cycleProgress (0.0 – 1.0, cycle starts at dawn 08:30)
  // -----------------------------------------------------------------------
  describe('cycleProgress', () => {
    it('returns 0 at dawn start (08:30)', () => {
      const { cycleProgress } = calculatePhase(510);
      assert.ok(Math.abs(cycleProgress) < 1e-9,
        `Expected 0 but got ${cycleProgress}`);
    });

    it('returns ~0.5 at 20:30 (12h after dawn)', () => {
      // 20:30 = 1230 min, 12h = 720 min after 510
      const { cycleProgress } = calculatePhase(1230);
      assert.ok(Math.abs(cycleProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${cycleProgress}`);
    });

    it('returns close to 1.0 just before dawn', () => {
      const { cycleProgress } = calculatePhase(509.9);
      assert.ok(cycleProgress > 0.99,
        `Expected >0.99 but got ${cycleProgress}`);
    });

    it('wraps back to ~0 at 08:30 the next day', () => {
      // 510 + 1440 = 1950 should wrap to 510
      const { cycleProgress } = calculatePhase(1950);
      assert.ok(cycleProgress < 0.01,
        `Expected ~0 (wrapped) but got ${cycleProgress}`);
    });
  });

  // -----------------------------------------------------------------------
  // phaseProgress (0.0 – 1.0 within each phase)
  // -----------------------------------------------------------------------
  describe('phaseProgress within a phase', () => {
    it('is 0.0 at dawn start (08:30)', () => {
      const { phaseProgress } = calculatePhase(510);
      assert.ok(Math.abs(phaseProgress) < 1e-9,
        `Expected 0 but got ${phaseProgress}`);
    });

    it('is ~0.5 at dawn midpoint (08:45 = 525 min)', () => {
      const { phaseProgress } = calculatePhase(525);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is 0.0 at day start (09:00)', () => {
      const { phaseProgress } = calculatePhase(540);
      assert.ok(Math.abs(phaseProgress) < 1e-9,
        `Expected 0 but got ${phaseProgress}`);
    });

    it('is ~0.5 at day midpoint (13:30 = 810 min)', () => {
      const { phaseProgress } = calculatePhase(810);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is 0.0 at dusk start (18:00)', () => {
      const { phaseProgress } = calculatePhase(1080);
      assert.ok(Math.abs(phaseProgress) < 1e-9,
        `Expected 0 but got ${phaseProgress}`);
    });

    it('is ~0.5 at dusk midpoint (18:15 = 1095 min)', () => {
      const { phaseProgress } = calculatePhase(1095);
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });

    it('is 0.0 at night start (18:30)', () => {
      const { phaseProgress } = calculatePhase(1110);
      assert.ok(Math.abs(phaseProgress) < 1e-9,
        `Expected 0 but got ${phaseProgress}`);
    });

    it('is ~0.5 at night midpoint (01:30 = 90 min, 7h after night start)', () => {
      // Night starts at 1110, duration 840 min, midpoint = 1110 + 420 = 1530 -> wraps to 90 min
      const { phaseProgress } = calculatePhase(90);
      // nightElapsed = (1440 - 1110) + 90 = 420, progress = 420/840 = 0.5
      assert.ok(Math.abs(phaseProgress - 0.5) < 1e-9,
        `Expected ~0.5 but got ${phaseProgress}`);
    });
  });

  // -----------------------------------------------------------------------
  // Wrapping (values outside 0-1440)
  // -----------------------------------------------------------------------
  describe('wrapping', () => {
    it('1440 + 540 wraps identically to 540', () => {
      const a = calculatePhase(540);
      const b = calculatePhase(1980);
      assert.equal(a.phaseName, b.phaseName);
      assert.ok(Math.abs(a.phaseProgress - b.phaseProgress) < 1e-9);
    });

    it('large values wrap correctly (14400 min = 10 full days)', () => {
      const a = calculatePhase(810);
      const b = calculatePhase(810 + 14400);
      assert.equal(a.phaseName, b.phaseName);
      assert.ok(Math.abs(a.cycleProgress - b.cycleProgress) < 1e-9);
    });

    it('negative values wrap correctly', () => {
      // -60 min => 1440 - 60 = 1380 min => night
      const a = calculatePhase(1380);
      const b = calculatePhase(-60);
      assert.equal(a.phaseName, b.phaseName);
      assert.ok(Math.abs(a.phaseProgress - b.phaseProgress) < 1e-9);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('fractional minutes work (08:30:30 = 510.5)', () => {
      const result = calculatePhase(510.5);
      assert.equal(result.phaseName, 'dawn');
      assert.ok(Math.abs(result.phaseProgress - 0.5 / 30) < 1e-9);
    });

    it('night wrapping: 23:59 is night', () => {
      assert.equal(calculatePhase(1439).phaseName, 'night');
    });

    it('night wrapping: 00:01 is night', () => {
      assert.equal(calculatePhase(1).phaseName, 'night');
    });

    it('night progress increases through midnight', () => {
      const before = calculatePhase(1400); // 23:20
      const after = calculatePhase(100);   // 01:40
      assert.ok(after.phaseProgress > before.phaseProgress,
        `Expected ${after.phaseProgress} > ${before.phaseProgress}`);
    });
  });
});
