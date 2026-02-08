// lanterns.test.js -- Tests for lantern position selection and update logic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseLanternPositions, updateLanterns } from '../../public/js/lanterns.js';

// ---------------------------------------------------------------------------
// chooseLanternPositions (pure function -- no THREE dependency)
// ---------------------------------------------------------------------------

describe('chooseLanternPositions', () => {
  it('returns up to 12 positions', () => {
    const buildings = [
      { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 0, z: 5 }, { x: 5, z: 5 },
      { x: -5, z: 0 }, { x: 0, z: -5 }, { x: -5, z: -5 },
    ];
    const positions = chooseLanternPositions(buildings);
    assert.ok(positions.length <= 12, `Expected <= 12 but got ${positions.length}`);
    assert.ok(positions.length > 0, 'Expected at least 1 position');
  });

  it('returns empty array for empty building list', () => {
    const positions = chooseLanternPositions([]);
    assert.equal(positions.length, 0);
  });

  it('returns positions with x and z properties', () => {
    const buildings = [{ x: 0, z: 0 }, { x: 4, z: 0 }];
    const positions = chooseLanternPositions(buildings, 4);
    for (const p of positions) {
      assert.equal(typeof p.x, 'number');
      assert.equal(typeof p.z, 'number');
    }
  });

  it('midpoints are between the buildings', () => {
    const buildings = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
    const positions = chooseLanternPositions(buildings, 1);
    assert.equal(positions.length, 1);
    assert.equal(positions[0].x, 5);
    assert.equal(positions[0].z, 0);
  });

  it('enforces minimum spacing between lanterns', () => {
    const buildings = [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 },
      { x: 0, z: 2 }, { x: 2, z: 2 }, { x: 4, z: 2 },
    ];
    const positions = chooseLanternPositions(buildings, 12);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x;
        const dz = positions[i].z - positions[j].z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        assert.ok(dist >= 1.99, `Lanterns ${i} and ${j} too close: ${dist.toFixed(2)}`);
      }
    }
  });

  it('with a single building returns fallback positions', () => {
    const buildings = [{ x: 3, z: 3 }];
    const positions = chooseLanternPositions(buildings, 2);
    // No pairs possible, but fallback jitter should produce some
    assert.ok(positions.length >= 1, 'Expected at least 1 fallback position');
  });
});

// ---------------------------------------------------------------------------
// updateLanterns
// ---------------------------------------------------------------------------

describe('updateLanterns', () => {
  function makeFakeLantern() {
    return {
      group: {},
      light: { intensity: 0 },
      globe: { material: { emissiveIntensity: 0 } },
    };
  }

  it('sets intensity to 0 during day', () => {
    const lanterns = [makeFakeLantern(), makeFakeLantern()];
    updateLanterns(lanterns, 'day', 0.5);
    for (const l of lanterns) {
      assert.equal(l.light.intensity, 0);
      assert.equal(l.globe.material.emissiveIntensity, 0);
    }
  });

  it('sets full intensity during night', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'night', 0.5);
    assert.equal(lanterns[0].light.intensity, 0.6);
    assert.equal(lanterns[0].globe.material.emissiveIntensity, 0.6);
  });

  it('lerps intensity during dusk', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'dusk', 0.5);
    assert.ok(Math.abs(lanterns[0].light.intensity - 0.3) < 1e-6,
      `Expected ~0.3 but got ${lanterns[0].light.intensity}`);
    assert.ok(Math.abs(lanterns[0].globe.material.emissiveIntensity - 0.3) < 1e-6);
  });

  it('lerps intensity during dawn (reverse)', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'dawn', 0.5);
    assert.ok(Math.abs(lanterns[0].light.intensity - 0.3) < 1e-6,
      `Expected ~0.3 but got ${lanterns[0].light.intensity}`);
  });

  it('dusk at progress=0 is off', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'dusk', 0);
    assert.equal(lanterns[0].light.intensity, 0);
  });

  it('dusk at progress=1 is full', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'dusk', 1);
    assert.ok(Math.abs(lanterns[0].light.intensity - 0.6) < 1e-6);
  });

  it('dawn at progress=0 is full', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'dawn', 0);
    assert.ok(Math.abs(lanterns[0].light.intensity - 0.6) < 1e-6);
  });

  it('dawn at progress=1 is off', () => {
    const lanterns = [makeFakeLantern()];
    updateLanterns(lanterns, 'dawn', 1);
    assert.equal(lanterns[0].light.intensity, 0);
  });

  it('handles empty lanterns array', () => {
    assert.doesNotThrow(() => updateLanterns([], 'night', 0.5));
  });
});
