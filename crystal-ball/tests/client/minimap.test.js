// minimap.test.js — Unit tests for the minimap pure helper functions.
//
// The functions under test (worldToMinimap, minimapToWorld, tileColor,
// unitStateColor) are pure logic with no DOM / THREE dependency.
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/minimap.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  worldToMinimap,
  minimapToWorld,
  tileColor,
  unitStateColor,
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
    // (13 + 14) / 28 * 150 = 27/28 * 150 = 144.64...
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
    assert.equal(tileColor('grass'), '#6B8E5B');
  });

  it('returns blue for water', () => {
    assert.equal(tileColor('water'), '#4A7EB0');
  });

  it('returns tan for sand', () => {
    assert.equal(tileColor('sand'), '#C8B278');
  });

  it('returns brown for mountain', () => {
    assert.equal(tileColor('mountain'), '#8B7355');
  });

  it('returns brown for mountain_peak', () => {
    assert.equal(tileColor('mountain_peak'), '#8B7355');
  });

  it('returns light brown for path', () => {
    assert.equal(tileColor('path'), '#A0926B');
  });

  it('returns light brown for bridge', () => {
    assert.equal(tileColor('bridge'), '#A0926B');
  });

  it('returns a default color for unknown tile types', () => {
    const color = tileColor('lava');
    assert.equal(typeof color, 'string');
    assert.ok(color.startsWith('#'), 'should be a hex color');
    // Default is grass green
    assert.equal(color, '#6B8E5B');
  });
});

// ---------------------------------------------------------------------------
// unitStateColor
// ---------------------------------------------------------------------------

describe('unitStateColor', () => {
  it('returns green for active', () => {
    assert.equal(unitStateColor('active'), '#4ade80');
  });

  it('returns gold for awaiting', () => {
    assert.equal(unitStateColor('awaiting'), '#e8c84a');
  });

  it('returns grey for idle', () => {
    assert.equal(unitStateColor('idle'), '#9e9e9e');
  });

  it('returns dim grey for stale', () => {
    assert.equal(unitStateColor('stale'), '#6e6e6e');
  });

  it('returns a default color for unknown states', () => {
    const color = unitStateColor('unknown');
    assert.equal(typeof color, 'string');
    assert.ok(color.startsWith('#'), 'should be a hex color');
    // Default is idle grey
    assert.equal(color, '#9e9e9e');
  });
});
