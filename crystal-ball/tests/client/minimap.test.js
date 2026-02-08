// minimap.test.js -- Unit tests for minimap pure helper functions.
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/minimap.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  worldToMinimap,
  minimapToWorld,
  tileColor,
  unitStateColor,
  projectViewportToGround,
} from '../../public/js/minimap.js';

// ---------------------------------------------------------------------------
// worldToMinimap
// ---------------------------------------------------------------------------

describe('worldToMinimap', () => {
  it('maps world origin (0, 0) to canvas center (75, 75)', () => {
    const { px, py } = worldToMinimap(0, 0);
    assert.equal(px, 75);
    assert.equal(py, 75);
  });

  it('maps (-14, -14) to canvas (0, 0)', () => {
    const { px, py } = worldToMinimap(-14, -14);
    assert.equal(px, 0);
    assert.equal(py, 0);
  });

  it('maps (+14, +14) to canvas (150, 150)', () => {
    const { px, py } = worldToMinimap(14, 14);
    assert.equal(px, 150);
    assert.equal(py, 150);
  });

  it('maps (+13, +13) to near (150, 150)', () => {
    const { px, py } = worldToMinimap(13, 13);
    assert.ok(px > 140 && px < 150, `px ${px} should be near 150`);
    assert.ok(py > 140 && py < 150, `py ${py} should be near 150`);
  });

  it('respects custom canvasSize and gridSize', () => {
    const { px, py } = worldToMinimap(0, 0, 200, 20);
    assert.equal(px, 100);
    assert.equal(py, 100);
  });
});

// ---------------------------------------------------------------------------
// minimapToWorld
// ---------------------------------------------------------------------------

describe('minimapToWorld', () => {
  it('maps canvas (0, 0) to world (-14, -14)', () => {
    const { worldX, worldZ } = minimapToWorld(0, 0);
    assert.equal(worldX, -14);
    assert.equal(worldZ, -14);
  });

  it('maps canvas center (75, 75) to world (0, 0)', () => {
    const { worldX, worldZ } = minimapToWorld(75, 75);
    assert.equal(worldX, 0);
    assert.equal(worldZ, 0);
  });

  it('maps canvas (150, 150) to world (14, 14)', () => {
    const { worldX, worldZ } = minimapToWorld(150, 150);
    assert.equal(worldX, 14);
    assert.equal(worldZ, 14);
  });

  it('is the inverse of worldToMinimap', () => {
    const wx = 5, wz = -3;
    const { px, py } = worldToMinimap(wx, wz);
    const { worldX, worldZ } = minimapToWorld(px, py);
    assert.ok(Math.abs(worldX - wx) < 0.001, `worldX ${worldX} should equal ${wx}`);
    assert.ok(Math.abs(worldZ - wz) < 0.001, `worldZ ${worldZ} should equal ${wz}`);
  });

  it('respects custom canvasSize and gridSize', () => {
    const { worldX, worldZ } = minimapToWorld(100, 100, 200, 20);
    assert.equal(worldX, 0);
    assert.equal(worldZ, 0);
  });
});

// ---------------------------------------------------------------------------
// tileColor
// ---------------------------------------------------------------------------

describe('tileColor', () => {
  it('returns green for grass', () => {
    assert.equal(tileColor('grass'), '#88C878');
  });

  it('returns blue for water', () => {
    assert.equal(tileColor('water'), '#58A8D0');
  });

  it('returns tan for sand', () => {
    assert.equal(tileColor('sand'), '#E0C890');
  });

  it('returns brown for mountain', () => {
    assert.equal(tileColor('mountain'), '#B0A898');
  });

  it('returns brown for mountain_peak', () => {
    assert.equal(tileColor('mountain_peak'), '#B0A898');
  });

  it('returns warm stone for mountain_plateau', () => {
    assert.equal(tileColor('mountain_plateau'), '#B4B098');
  });

  it('returns light brown for path', () => {
    assert.equal(tileColor('path'), '#D0C4A8');
  });

  it('returns light brown for bridge', () => {
    assert.equal(tileColor('bridge'), '#D0C4A8');
  });

  it('returns a default color for unknown tile types', () => {
    const color = tileColor('lava');
    assert.equal(typeof color, 'string');
    assert.ok(color.startsWith('#'), 'should be a hex color');
    assert.equal(color, '#A0B898');
  });
});

// ---------------------------------------------------------------------------
// unitStateColor
// ---------------------------------------------------------------------------

describe('unitStateColor', () => {
  it('returns green for active', () => {
    assert.equal(unitStateColor('active'), '#60D890');
  });

  it('returns gold for awaiting', () => {
    assert.equal(unitStateColor('awaiting'), '#F0C050');
  });

  it('returns grey for idle', () => {
    assert.equal(unitStateColor('idle'), '#B0ACB0');
  });

  it('returns dark red for stale', () => {
    assert.equal(unitStateColor('stale'), '#C86868');
  });

  it('returns red for blocked', () => {
    assert.equal(unitStateColor('blocked'), '#D87068');
  });

  it('returns a default color for unknown states', () => {
    const color = unitStateColor('unknown');
    assert.equal(typeof color, 'string');
    assert.ok(color.startsWith('#'), 'should be a hex color');
    assert.equal(color, '#B0ACB0');
  });
});

// ---------------------------------------------------------------------------
// projectViewportToGround
// ---------------------------------------------------------------------------

describe('projectViewportToGround', () => {
  it('returns 4 corners for a top-down camera', () => {
    // Camera looking straight down: pos=(0,10,0), fwd=(0,-1,0), rt=(1,0,0), up=(0,0,-1)
    const camPos = { x: 0, y: 10, z: 0 };
    const fwd = { x: 0, y: -1, z: 0 };
    const rt  = { x: 1, y: 0, z: 0 };
    const up  = { x: 0, y: 0, z: -1 };

    const corners = projectViewportToGround(camPos, fwd, rt, up, -5, 5, 5, -5);
    assert.equal(corners.length, 4);
  });

  it('top-down camera produces axis-aligned rectangle', () => {
    const camPos = { x: 0, y: 10, z: 0 };
    const fwd = { x: 0, y: -1, z: 0 };
    const rt  = { x: 1, y: 0, z: 0 };
    const up  = { x: 0, y: 0, z: -1 };

    const corners = projectViewportToGround(camPos, fwd, rt, up, -5, 5, 3, -3);

    // BL, BR, TR, TL
    assert.ok(Math.abs(corners[0].x - (-5)) < 0.01, `BL.x should be -5, got ${corners[0].x}`);
    assert.ok(Math.abs(corners[0].z - 3) < 0.01, `BL.z should be 3, got ${corners[0].z}`);
    assert.ok(Math.abs(corners[1].x - 5) < 0.01, `BR.x should be 5, got ${corners[1].x}`);
    assert.ok(Math.abs(corners[2].x - 5) < 0.01, `TR.x should be 5`);
    assert.ok(Math.abs(corners[2].z - (-3)) < 0.01, `TR.z should be -3, got ${corners[2].z}`);
  });

  it('isometric camera produces a diamond (rotated rectangle)', () => {
    // Camera at (10,10,10) looking at origin
    const s3 = 1 / Math.sqrt(3);
    const s2 = 1 / Math.sqrt(2);
    const s6 = 1 / Math.sqrt(6);

    const camPos = { x: 10, y: 10, z: 10 };
    const fwd = { x: -s3, y: -s3, z: -s3 };
    const rt  = { x: s2, y: 0, z: -s2 };
    const up  = { x: -s6, y: 2*s6, z: -s6 };

    const corners = projectViewportToGround(camPos, fwd, rt, up, -7, 7, 7, -7);

    assert.equal(corners.length, 4);

    // The diamond should be centered at world origin (0, 0)
    const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
    const cz = corners.reduce((s, c) => s + c.z, 0) / 4;
    assert.ok(Math.abs(cx) < 0.5, `centroid X should be near 0, got ${cx}`);
    assert.ok(Math.abs(cz) < 0.5, `centroid Z should be near 0, got ${cz}`);

    // Not axis-aligned: X coords should not all be the same pair
    const xs = corners.map(c => Math.round(c.x * 10) / 10);
    const uniqueXs = new Set(xs);
    assert.ok(uniqueXs.size >= 3, `should have varied X coords (diamond), got ${[...uniqueXs]}`);
  });

  it('panned camera shifts the ground footprint', () => {
    // Top-down but offset
    const camPos = { x: 5, y: 10, z: -3 };
    const fwd = { x: 0, y: -1, z: 0 };
    const rt  = { x: 1, y: 0, z: 0 };
    const up  = { x: 0, y: 0, z: -1 };

    const corners = projectViewportToGround(camPos, fwd, rt, up, -4, 4, 4, -4);

    const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
    const cz = corners.reduce((s, c) => s + c.z, 0) / 4;
    assert.ok(Math.abs(cx - 5) < 0.01, `centroid X should be 5, got ${cx}`);
    assert.ok(Math.abs(cz - (-3)) < 0.01, `centroid Z should be -3, got ${cz}`);
  });

  it('returns empty array if camera is parallel to ground', () => {
    const camPos = { x: 0, y: 0, z: 0 };
    const fwd = { x: 1, y: 0, z: 0 }; // horizontal
    const rt  = { x: 0, y: 0, z: 1 };
    const up  = { x: 0, y: 1, z: 0 };

    const corners = projectViewportToGround(camPos, fwd, rt, up, -5, 5, 5, -5);
    assert.equal(corners.length, 0);
  });
});
