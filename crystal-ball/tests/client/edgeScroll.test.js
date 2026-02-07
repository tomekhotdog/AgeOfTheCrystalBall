// edgeScroll.test.js — Unit tests for AoE-style edge-scroll direction computation.
//
// The function under test is pure (no DOM or THREE.js dependency).
//
//   node --test tests/client/edgeScroll.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeEdgeScrollDir } from '../../public/js/edgeScroll.js';

// Viewport: 1000 x 800, default edge zone = 30px

// ---------------------------------------------------------------------------
// Center (no scroll)
// ---------------------------------------------------------------------------

describe('computeEdgeScrollDir', () => {
  it('returns null when cursor is in the center', () => {
    assert.equal(computeEdgeScrollDir(500, 400, 1000, 800), null);
  });

  // ── Single edges ──────────────────────────────────────────────────────

  it('top edge scrolls up (dx:-1, dz:-1)', () => {
    const dir = computeEdgeScrollDir(500, 10, 1000, 800);
    assert.deepEqual(dir, { dx: -1, dz: -1 });
  });

  it('bottom edge scrolls down (dx:+1, dz:+1)', () => {
    const dir = computeEdgeScrollDir(500, 790, 1000, 800);
    assert.deepEqual(dir, { dx: 1, dz: 1 });
  });

  it('left edge scrolls left (dx:-1, dz:+1)', () => {
    const dir = computeEdgeScrollDir(10, 400, 1000, 800);
    assert.deepEqual(dir, { dx: -1, dz: 1 });
  });

  it('right edge scrolls right (dx:+1, dz:-1)', () => {
    const dir = computeEdgeScrollDir(990, 400, 1000, 800);
    assert.deepEqual(dir, { dx: 1, dz: -1 });
  });

  // ── Corners (two edges combined) ──────────────────────────────────────

  it('top-left corner combines up+left (dx:-2, dz:0)', () => {
    const dir = computeEdgeScrollDir(10, 10, 1000, 800);
    assert.deepEqual(dir, { dx: -2, dz: 0 });
  });

  it('top-right corner combines up+right (dx:0, dz:-2)', () => {
    const dir = computeEdgeScrollDir(990, 10, 1000, 800);
    assert.deepEqual(dir, { dx: 0, dz: -2 });
  });

  it('bottom-left corner combines down+left (dx:0, dz:+2)', () => {
    const dir = computeEdgeScrollDir(10, 790, 1000, 800);
    assert.deepEqual(dir, { dx: 0, dz: 2 });
  });

  it('bottom-right corner combines down+right (dx:+2, dz:0)', () => {
    const dir = computeEdgeScrollDir(990, 790, 1000, 800);
    assert.deepEqual(dir, { dx: 2, dz: 0 });
  });

  // ── Edge boundaries ───────────────────────────────────────────────────

  it('cursor exactly at edge boundary (y=30) returns null', () => {
    // y=30 is NOT < 30, so it should not trigger top-edge scroll
    assert.equal(computeEdgeScrollDir(500, 30, 1000, 800), null);
  });

  it('cursor at y=29 triggers top-edge scroll', () => {
    const dir = computeEdgeScrollDir(500, 29, 1000, 800);
    assert.deepEqual(dir, { dx: -1, dz: -1 });
  });

  it('cursor exactly at bottom boundary (y=770) returns null', () => {
    // viewportH - edgeZone = 800 - 30 = 770; y=770 is NOT > 770
    assert.equal(computeEdgeScrollDir(500, 770, 1000, 800), null);
  });

  it('cursor at y=771 triggers bottom-edge scroll', () => {
    const dir = computeEdgeScrollDir(500, 771, 1000, 800);
    assert.deepEqual(dir, { dx: 1, dz: 1 });
  });

  // ── Custom edge zone ──────────────────────────────────────────────────

  it('custom edge zone parameter works', () => {
    // With edgeZone=50, cursor at y=40 should trigger (40 < 50)
    const dir = computeEdgeScrollDir(500, 40, 1000, 800, 50);
    assert.deepEqual(dir, { dx: -1, dz: -1 });

    // Same position with default edgeZone=30 should NOT trigger (40 >= 30)
    assert.equal(computeEdgeScrollDir(500, 40, 1000, 800), null);
  });

  // ── Out-of-bounds / negative cursor ───────────────────────────────────

  it('negative cursor X returns null', () => {
    assert.equal(computeEdgeScrollDir(-10, 400, 1000, 800), null);
  });

  it('negative cursor Y returns null', () => {
    assert.equal(computeEdgeScrollDir(500, -10, 1000, 800), null);
  });

  it('cursor beyond viewport width returns null', () => {
    assert.equal(computeEdgeScrollDir(1100, 400, 1000, 800), null);
  });

  it('cursor beyond viewport height returns null', () => {
    assert.equal(computeEdgeScrollDir(500, 900, 1000, 800), null);
  });
});
