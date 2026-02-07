// heatmap.test.js — Unit tests for the heatmap overlay pure functions.
//
// Only the THREE-free pure functions are tested here:
//   cpuToHeatColor, findNearestBuilding, computeTileCpuMap
//
// The Heatmap class uses THREE internals and is not tested in this file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cpuToHeatColor,
  findNearestBuilding,
  computeTileCpuMap,
} from '../../public/js/heatmap.js';

// ---------------------------------------------------------------------------
// cpuToHeatColor
// ---------------------------------------------------------------------------

describe('cpuToHeatColor', () => {
  describe('threshold boundaries', () => {
    it('returns cold (0x4488AA) for totalCpu = 0', () => {
      assert.equal(cpuToHeatColor(0), 0x4488AA);
    });

    it('returns cold (0x4488AA) for totalCpu = 10 (at boundary)', () => {
      assert.equal(cpuToHeatColor(10), 0x4488AA);
    });

    it('returns cool (0xBBCC44) for totalCpu = 10.01 (just above cold boundary)', () => {
      assert.equal(cpuToHeatColor(10.01), 0xBBCC44);
    });

    it('returns cool (0xBBCC44) for totalCpu = 50 (at boundary)', () => {
      assert.equal(cpuToHeatColor(50), 0xBBCC44);
    });

    it('returns warm (0xE8843A) for totalCpu = 50.01 (just above cool boundary)', () => {
      assert.equal(cpuToHeatColor(50.01), 0xE8843A);
    });

    it('returns warm (0xE8843A) for totalCpu = 100 (at boundary)', () => {
      assert.equal(cpuToHeatColor(100), 0xE8843A);
    });

    it('returns hot (0xCC3333) for totalCpu = 100.01 (just above warm boundary)', () => {
      assert.equal(cpuToHeatColor(100.01), 0xCC3333);
    });
  });

  describe('values within ranges', () => {
    it('returns cold for totalCpu = 5', () => {
      assert.equal(cpuToHeatColor(5), 0x4488AA);
    });

    it('returns cool for totalCpu = 30', () => {
      assert.equal(cpuToHeatColor(30), 0xBBCC44);
    });

    it('returns warm for totalCpu = 75', () => {
      assert.equal(cpuToHeatColor(75), 0xE8843A);
    });

    it('returns hot for totalCpu = 200', () => {
      assert.equal(cpuToHeatColor(200), 0xCC3333);
    });

    it('returns hot for very high CPU (500)', () => {
      assert.equal(cpuToHeatColor(500), 0xCC3333);
    });
  });

  describe('edge cases', () => {
    it('returns cold for negative CPU values', () => {
      assert.equal(cpuToHeatColor(-10), 0x4488AA);
    });
  });
});

// ---------------------------------------------------------------------------
// findNearestBuilding
// ---------------------------------------------------------------------------

describe('findNearestBuilding', () => {
  describe('single building', () => {
    it('returns the only building groupId', () => {
      const buildings = [{ x: 3, z: 4, groupId: 'alpha' }];
      assert.equal(findNearestBuilding(0, 0, buildings), 'alpha');
    });

    it('returns the groupId even when tile is at the same position', () => {
      const buildings = [{ x: 5, z: 5, groupId: 'exact' }];
      assert.equal(findNearestBuilding(5, 5, buildings), 'exact');
    });
  });

  describe('multiple buildings', () => {
    const buildings = [
      { x: 0, z: 0, groupId: 'origin' },
      { x: 10, z: 0, groupId: 'east' },
      { x: 0, z: 10, groupId: 'south' },
    ];

    it('returns nearest building when tile is close to origin', () => {
      assert.equal(findNearestBuilding(1, 1, buildings), 'origin');
    });

    it('returns nearest building when tile is close to east', () => {
      assert.equal(findNearestBuilding(9, 0, buildings), 'east');
    });

    it('returns nearest building when tile is close to south', () => {
      assert.equal(findNearestBuilding(0, 9, buildings), 'south');
    });

    it('returns nearest building when tile is equidistant between two (first wins)', () => {
      // Midpoint between origin (0,0) and east (10,0) is (5,0)
      // Both are distance 5 away. First one encountered (origin) wins
      // because < is strict.
      const result = findNearestBuilding(5, 0, buildings);
      assert.equal(result, 'origin');
    });
  });

  describe('empty and null inputs', () => {
    it('returns null for empty buildings array', () => {
      assert.equal(findNearestBuilding(0, 0, []), null);
    });

    it('returns null for null buildings', () => {
      assert.equal(findNearestBuilding(0, 0, null), null);
    });

    it('returns null for undefined buildings', () => {
      assert.equal(findNearestBuilding(0, 0, undefined), null);
    });
  });

  describe('negative coordinates', () => {
    it('handles negative tile coordinates correctly', () => {
      const buildings = [
        { x: -5, z: -5, groupId: 'neg' },
        { x: 5, z: 5, groupId: 'pos' },
      ];
      assert.equal(findNearestBuilding(-4, -4, buildings), 'neg');
    });

    it('handles negative building coordinates correctly', () => {
      const buildings = [
        { x: -10, z: -10, groupId: 'far-neg' },
        { x: -1, z: -1, groupId: 'near-neg' },
      ];
      assert.equal(findNearestBuilding(0, 0, buildings), 'near-neg');
    });
  });
});

// ---------------------------------------------------------------------------
// computeTileCpuMap
// ---------------------------------------------------------------------------

describe('computeTileCpuMap', () => {
  describe('basic computation', () => {
    it('returns a Map with an entry for each tile', () => {
      const tiles = new Map([
        ['0,0', {}],
        ['1,0', {}],
        ['0,1', {}],
      ]);
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([
        ['g1', [{ cpu: 25 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.size, 3);
    });

    it('sums CPU for all sessions in the nearest group', () => {
      const tiles = new Map([['0,0', {}]]);
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([
        ['g1', [{ cpu: 30 }, { cpu: 45 }, { cpu: 10 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.get('0,0'), 85);
    });

    it('maps each tile to its nearest building group CPU', () => {
      const tiles = new Map([
        ['0,0', {}],
        ['10,0', {}],
      ]);
      const buildings = [
        { x: 0, z: 0, groupId: 'left' },
        { x: 10, z: 0, groupId: 'right' },
      ];
      const sessionsByGroup = new Map([
        ['left', [{ cpu: 20 }]],
        ['right', [{ cpu: 80 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.get('0,0'), 20);
      assert.equal(result.get('10,0'), 80);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for all tiles when no buildings exist', () => {
      const tiles = new Map([
        ['0,0', {}],
        ['1,1', {}],
      ]);

      const result = computeTileCpuMap(tiles, [], new Map());
      assert.equal(result.get('0,0'), 0);
      assert.equal(result.get('1,1'), 0);
    });

    it('returns 0 for tiles whose nearest group has no sessions', () => {
      const tiles = new Map([['0,0', {}]]);
      const buildings = [{ x: 0, z: 0, groupId: 'empty' }];
      const sessionsByGroup = new Map(); // no sessions for 'empty'

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.get('0,0'), 0);
    });

    it('handles sessions with cpu = 0', () => {
      const tiles = new Map([['0,0', {}]]);
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([
        ['g1', [{ cpu: 0 }, { cpu: 0 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.get('0,0'), 0);
    });

    it('handles sessions with missing cpu field (treated as 0)', () => {
      const tiles = new Map([['0,0', {}]]);
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([
        ['g1', [{ cpu: 50 }, {}]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.get('0,0'), 50);
    });

    it('returns empty Map for empty tiles', () => {
      const tiles = new Map();
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([['g1', [{ cpu: 50 }]]]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.size, 0);
    });
  });

  describe('integration with cpuToHeatColor thresholds', () => {
    it('produces cold-range CPU for a low-activity group', () => {
      const tiles = new Map([['0,0', {}]]);
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([
        ['g1', [{ cpu: 3 }, { cpu: 2 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      const cpu = result.get('0,0');
      assert.equal(cpu, 5);
      assert.equal(cpuToHeatColor(cpu), 0x4488AA); // cold
    });

    it('produces hot-range CPU for a high-activity group', () => {
      const tiles = new Map([['0,0', {}]]);
      const buildings = [{ x: 0, z: 0, groupId: 'g1' }];
      const sessionsByGroup = new Map([
        ['g1', [{ cpu: 60 }, { cpu: 80 }, { cpu: 45 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      const cpu = result.get('0,0');
      assert.equal(cpu, 185);
      assert.equal(cpuToHeatColor(cpu), 0xCC3333); // hot
    });
  });

  describe('negative tile coordinates', () => {
    it('correctly parses negative tile keys', () => {
      const tiles = new Map([
        ['-5,-3', {}],
        ['5,3', {}],
      ]);
      const buildings = [
        { x: -5, z: -3, groupId: 'neg' },
        { x: 5, z: 3, groupId: 'pos' },
      ];
      const sessionsByGroup = new Map([
        ['neg', [{ cpu: 15 }]],
        ['pos', [{ cpu: 90 }]],
      ]);

      const result = computeTileCpuMap(tiles, buildings, sessionsByGroup);
      assert.equal(result.get('-5,-3'), 15);
      assert.equal(result.get('5,3'), 90);
    });
  });
});
