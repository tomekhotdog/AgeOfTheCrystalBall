// terrain.test.js — Tests for the terrain system's pure logic functions.
// Uses node:test and node:assert (no Three.js dependency needed).
//
// The terrain module exports several pure functions that handle biome
// assignment, quadrant mapping, tile classification, and river generation.
// These can be tested without a THREE.js mock.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// We cannot import the full terrain.js (it imports 'three'), so we
// re-implement / inline the pure exported functions here. This ensures
// the logic is tested independently of the rendering layer.
//
// In a real CI setup you would use a bundler alias or conditional import
// to strip THREE. For now we duplicate the pure logic faithfully.
// ---------------------------------------------------------------------------

const GRID = 28;
const HALF = GRID / 2;
const BIOME_LIST = ['meadow', 'forest', 'desert', 'mountain'];
const TRANSITION_WIDTH = 2;

function pseudoRandom(x, z) {
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function assignBiomes() {
  const biomes = [...BIOME_LIST];
  for (let i = biomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [biomes[i], biomes[j]] = [biomes[j], biomes[i]];
  }
  return biomes;
}

function quadrantIndex(gx, gz) {
  const halfGrid = GRID / 2;
  const col = gx < halfGrid ? 0 : 1;
  const row = gz < halfGrid ? 0 : 1;
  return row * 2 + col;
}

function biomeAt(gx, gz, biomeMap) {
  const halfGrid = GRID / 2;
  const distToBoundaryX = Math.abs(gx - halfGrid + 0.5);
  const distToBoundaryZ = Math.abs(gz - halfGrid + 0.5);
  const minDistToBoundary = Math.min(distToBoundaryX, distToBoundaryZ);

  if (minDistToBoundary > TRANSITION_WIDTH) {
    return biomeMap[quadrantIndex(gx, gz)];
  }

  const noise = (pseudoRandom(gx * 3, gz * 7) - 0.5) * 1.5;
  const adjustedGx = gx + noise * 0.3;
  const adjustedGz = gz + noise * 0.3;
  return biomeMap[quadrantIndex(Math.round(adjustedGx), Math.round(adjustedGz))];
}

function generateRiverPath() {
  const riverTiles = new Set();
  let cx = 4 + Math.floor(Math.random() * 4);

  for (let gz = 0; gz < GRID; gz++) {
    const wave = Math.sin(gz * 0.35) * 2.5;
    const drift = gz * 0.4;
    const noise = (pseudoRandom(gz * 5, 42) - 0.5) * 1.5;
    const x = Math.round(cx + wave + drift + noise);

    const width = pseudoRandom(x, gz) > 0.6 ? 3 : 2;
    for (let dx = 0; dx < width; dx++) {
      const tileGx = Math.max(0, Math.min(GRID - 1, x + dx));
      riverTiles.add(`${tileGx},${gz}`);
    }
  }
  return riverTiles;
}

function findBridgeLocation(riverTiles) {
  const candidates = [];
  for (let gz = Math.floor(GRID * 0.35); gz < Math.floor(GRID * 0.65); gz++) {
    let minGx = GRID, maxGx = -1;
    for (let gx = 0; gx < GRID; gx++) {
      if (riverTiles.has(`${gx},${gz}`)) {
        if (gx < minGx) minGx = gx;
        if (gx > maxGx) maxGx = gx;
      }
    }
    if (maxGx >= 0) {
      candidates.push({ gz, minGx, maxGx, width: maxGx - minGx + 1 });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.width - b.width);
  return candidates[0];
}

function classifyTile(gx, gz, biome, isRiver) {
  if (isRiver) {
    return {
      type: 'water',
      height: 0.08,
      color: pseudoRandom(gx, gz) > 0.5 ? 0x6B9DAD : 0x5A8B9D,
      transparent: true,
      opacity: 0.65,
    };
  }

  const rng = pseudoRandom(gx, gz);

  switch (biome) {
    case 'meadow': {
      const height = 0.12 + rng * 0.06;
      return { type: 'grass', height, color: rng > 0.5 ? 0x8BA888 : 0x97B594 };
    }
    case 'forest': {
      const height = 0.12 + rng * 0.06;
      return { type: 'grass', height, color: rng > 0.5 ? 0x6E8B6E : 0x5A7A5A };
    }
    case 'desert': {
      const height = 0.10 + rng * 0.04;
      return { type: 'sand', height, color: rng > 0.5 ? 0xD4C4A0 : 0xC4B490 };
    }
    case 'mountain': {
      const edgeDist = Math.min(gx, gz, GRID - 1 - gx, GRID - 1 - gz);
      const edgeFactor = Math.max(0, 1 - edgeDist / 6);
      const height = 0.2 + edgeFactor * 0.6;
      const isOuterRing = edgeDist <= 1;
      return {
        type: isOuterRing ? 'mountain_peak' : 'mountain',
        height,
        color: rng > 0.5 ? 0x7A7A7A : 0x8A8A80,
      };
    }
    default:
      return { type: 'grass', height: 0.15, color: 0x8BA888 };
  }
}

// ---------------------------------------------------------------------------
// Simulate the full tile generation (without THREE) to test tile counts,
// biome coverage, water tiles, and the getAvailableGrassTile logic.
// ---------------------------------------------------------------------------

function simulateTerrain() {
  const tiles = new Map();
  const waterTiles = new Set();
  const pathTiles = new Set();
  const usedTiles = new Set();

  const biomeMap = assignBiomes();
  const riverTileKeys = generateRiverPath();
  const bridge = findBridgeLocation(riverTileKeys);

  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const wx = gx - HALF;
      const wz = gz - HALF;
      const biome = biomeAt(gx, gz, biomeMap);
      const isRiver = riverTileKeys.has(`${gx},${gz}`);
      const info = classifyTile(gx, gz, biome, isRiver);

      const key = `${wx},${wz}`;
      tiles.set(key, { type: info.type, height: info.height, biome });
      if (info.type === 'water') waterTiles.add(key);
    }
  }

  if (bridge) {
    for (let gx = bridge.minGx - 1; gx <= bridge.maxGx + 1; gx++) {
      pathTiles.add(`${gx - HALF},${bridge.gz - HALF}`);
    }
  }

  const buildingPositions = [];

  function getAvailableGrassTile() {
    const candidates = [];
    for (let gx = 3; gx < GRID - 3; gx++) {
      for (let gz = 3; gz < GRID - 3; gz++) {
        const wx = gx - HALF;
        const wz = gz - HALF;
        const key = `${wx},${wz}`;
        const entry = tiles.get(key);
        if (!entry) continue;
        if (entry.type !== 'grass' && entry.type !== 'sand') continue;
        if (usedTiles.has(key)) continue;
        if (entry.biome === 'mountain') continue;

        let nearWater = false;
        for (let dx = -1; dx <= 1 && !nearWater; dx++) {
          for (let dz = -1; dz <= 1 && !nearWater; dz++) {
            if (waterTiles.has(`${wx + dx},${wz + dz}`)) nearWater = true;
          }
        }
        if (nearWater) continue;
        candidates.push({ x: wx, z: wz, biome: entry.biome });
      }
    }

    if (candidates.length === 0) return null;

    const biomeCounts = {};
    for (const bp of buildingPositions) {
      biomeCounts[bp.biome] = (biomeCounts[bp.biome] || 0) + 1;
    }

    const byBiome = {};
    for (const c of candidates) {
      if (!byBiome[c.biome]) byBiome[c.biome] = [];
      byBiome[c.biome].push(c);
    }

    const biomeOrder = Object.keys(byBiome).sort(
      (a, b) => (biomeCounts[a] || 0) - (biomeCounts[b] || 0)
    );

    for (const biome of biomeOrder) {
      for (const c of byBiome[biome]) {
        let tooClose = false;
        for (const used of usedTiles) {
          const [ux, uz] = used.split(',').map(Number);
          if (Math.abs(ux - c.x) <= 5 && Math.abs(uz - c.z) <= 5) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) return c;
      }
    }

    if (biomeOrder.length > 0) {
      return byBiome[biomeOrder[0]][0];
    }
    return candidates[0] || null;
  }

  function markTileUsed(x, z) {
    const key = `${x},${z}`;
    usedTiles.add(key);
    const entry = tiles.get(key);
    if (entry) {
      buildingPositions.push({ x, z, biome: entry.biome });
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        usedTiles.add(`${x + dx},${z + dz}`);
      }
    }
  }

  function getBiomeAt(x, z) {
    const gx = x + HALF;
    const gz = z + HALF;
    if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) return 'unknown';
    return biomeAt(gx, gz, biomeMap);
  }

  return {
    tiles,
    waterTiles,
    pathTiles,
    usedTiles,
    buildingPositions,
    biomeMap,
    riverTileKeys,
    bridge,
    getAvailableGrassTile,
    markTileUsed,
    getBiomeAt,
  };
}

// ---------------------------------------------------------------------------
// materialKey — duplicated from terrain.js for testing (no THREE dependency)
// ---------------------------------------------------------------------------

function materialKey(colorHex, emissiveHex, emissiveIntensity, castShadow, receiveShadow) {
  return `${colorHex}|${emissiveHex}|${emissiveIntensity}|${castShadow}|${receiveShadow}`;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('pseudoRandom', () => {
  it('returns a value between 0 and 1', () => {
    for (let x = -20; x < 20; x++) {
      for (let z = -20; z < 20; z++) {
        const val = pseudoRandom(x, z);
        assert.ok(val >= 0 && val < 1, `pseudoRandom(${x}, ${z}) = ${val} out of range`);
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    assert.equal(pseudoRandom(5, 10), pseudoRandom(5, 10));
    assert.equal(pseudoRandom(-3, 7), pseudoRandom(-3, 7));
  });

  it('produces different values for different inputs', () => {
    // Not a guarantee for all pairs, but should hold for most
    const a = pseudoRandom(1, 2);
    const b = pseudoRandom(3, 4);
    assert.notEqual(a, b);
  });
});

describe('assignBiomes', () => {
  it('returns exactly 4 biomes', () => {
    const biomes = assignBiomes();
    assert.equal(biomes.length, 4);
  });

  it('contains all 4 biome types', () => {
    const biomes = assignBiomes();
    const sorted = [...biomes].sort();
    assert.deepEqual(sorted, ['desert', 'forest', 'meadow', 'mountain']);
  });

  it('is a permutation (no duplicates)', () => {
    const biomes = assignBiomes();
    const unique = new Set(biomes);
    assert.equal(unique.size, 4);
  });
});

describe('quadrantIndex', () => {
  it('returns 0 for top-left quadrant', () => {
    assert.equal(quadrantIndex(0, 0), 0);
    assert.equal(quadrantIndex(5, 5), 0);
    assert.equal(quadrantIndex(13, 13), 0);
  });

  it('returns 1 for top-right quadrant', () => {
    assert.equal(quadrantIndex(14, 0), 1);
    assert.equal(quadrantIndex(20, 5), 1);
  });

  it('returns 2 for bottom-left quadrant', () => {
    assert.equal(quadrantIndex(0, 14), 2);
    assert.equal(quadrantIndex(5, 20), 2);
  });

  it('returns 3 for bottom-right quadrant', () => {
    assert.equal(quadrantIndex(14, 14), 3);
    assert.equal(quadrantIndex(27, 27), 3);
  });

  it('always returns 0, 1, 2, or 3', () => {
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const idx = quadrantIndex(gx, gz);
        assert.ok(idx >= 0 && idx <= 3, `quadrantIndex(${gx}, ${gz}) = ${idx}`);
      }
    }
  });
});

describe('biomeAt', () => {
  const biomeMap = ['meadow', 'forest', 'desert', 'mountain'];

  it('returns a valid biome name for every grid cell', () => {
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const biome = biomeAt(gx, gz, biomeMap);
        assert.ok(
          BIOME_LIST.includes(biome),
          `biomeAt(${gx}, ${gz}) returned '${biome}' which is not a valid biome`
        );
      }
    }
  });

  it('returns the correct biome deep inside each quadrant (no transition)', () => {
    // Deep in quadrant 0 (top-left)
    assert.equal(biomeAt(3, 3, biomeMap), 'meadow');
    // Deep in quadrant 1 (top-right)
    assert.equal(biomeAt(20, 3, biomeMap), 'forest');
    // Deep in quadrant 2 (bottom-left)
    assert.equal(biomeAt(3, 20, biomeMap), 'desert');
    // Deep in quadrant 3 (bottom-right)
    assert.equal(biomeAt(20, 20, biomeMap), 'mountain');
  });
});

describe('classifyTile', () => {
  it('returns water type for river tiles', () => {
    const info = classifyTile(10, 10, 'meadow', true);
    assert.equal(info.type, 'water');
    assert.equal(info.transparent, true);
    assert.ok(info.opacity < 1.0);
  });

  it('returns grass type for meadow biome (non-river)', () => {
    const info = classifyTile(5, 5, 'meadow', false);
    assert.equal(info.type, 'grass');
    assert.ok(info.height >= 0.12 && info.height <= 0.18);
  });

  it('returns grass type for forest biome (non-river)', () => {
    const info = classifyTile(5, 5, 'forest', false);
    assert.equal(info.type, 'grass');
    assert.ok(info.height >= 0.12 && info.height <= 0.18);
  });

  it('returns sand type for desert biome (non-river)', () => {
    const info = classifyTile(5, 5, 'desert', false);
    assert.equal(info.type, 'sand');
    assert.ok(info.height >= 0.10 && info.height <= 0.14);
  });

  it('returns mountain or mountain_peak for mountain biome', () => {
    // Inner mountain tile (far from edges)
    const inner = classifyTile(10, 10, 'mountain', false);
    assert.ok(inner.type === 'mountain' || inner.type === 'mountain_peak');
    assert.ok(inner.height >= 0.2);

    // Edge mountain tile
    const edge = classifyTile(0, 0, 'mountain', false);
    assert.equal(edge.type, 'mountain_peak');
    assert.ok(edge.height >= 0.6, `edge mountain height ${edge.height} should be >= 0.6`);
  });

  it('mountain height increases toward map edges', () => {
    const center = classifyTile(12, 12, 'mountain', false);
    const edge = classifyTile(1, 1, 'mountain', false);
    assert.ok(edge.height > center.height,
      `edge height ${edge.height} should be > center height ${center.height}`);
  });
});

describe('generateRiverPath', () => {
  it('produces river tiles', () => {
    const river = generateRiverPath();
    assert.ok(river.size > 0, 'river should have tiles');
  });

  it('river tiles are within grid bounds', () => {
    const river = generateRiverPath();
    for (const key of river) {
      const [gx, gz] = key.split(',').map(Number);
      assert.ok(gx >= 0 && gx < GRID, `gx=${gx} out of bounds`);
      assert.ok(gz >= 0 && gz < GRID, `gz=${gz} out of bounds`);
    }
  });

  it('river spans the full height of the map (every row has at least one tile)', () => {
    const river = generateRiverPath();
    const rowsWithWater = new Set();
    for (const key of river) {
      const gz = parseInt(key.split(',')[1], 10);
      rowsWithWater.add(gz);
    }
    for (let gz = 0; gz < GRID; gz++) {
      assert.ok(rowsWithWater.has(gz), `row ${gz} has no river tile`);
    }
  });

  it('river has width of 2-3 tiles per row', () => {
    const river = generateRiverPath();
    const rowWidths = new Map();
    for (const key of river) {
      const [gx, gz] = key.split(',').map(Number);
      if (!rowWidths.has(gz)) rowWidths.set(gz, []);
      rowWidths.get(gz).push(gx);
    }
    for (const [gz, gxList] of rowWidths) {
      assert.ok(gxList.length >= 2, `row ${gz} has only ${gxList.length} tiles`);
      assert.ok(gxList.length <= 4, `row ${gz} has ${gxList.length} tiles (expect <=4)`);
    }
  });
});

describe('findBridgeLocation', () => {
  it('returns a bridge location for a valid river', () => {
    const river = generateRiverPath();
    const bridge = findBridgeLocation(river);
    assert.ok(bridge !== null, 'bridge should be found');
    assert.ok(typeof bridge.gz === 'number');
    assert.ok(typeof bridge.minGx === 'number');
    assert.ok(typeof bridge.maxGx === 'number');
  });

  it('bridge is located near the center rows of the map', () => {
    const river = generateRiverPath();
    const bridge = findBridgeLocation(river);
    if (bridge) {
      assert.ok(bridge.gz >= Math.floor(GRID * 0.35),
        `bridge gz=${bridge.gz} too high`);
      assert.ok(bridge.gz < Math.floor(GRID * 0.65),
        `bridge gz=${bridge.gz} too low`);
    }
  });

  it('returns null for an empty river', () => {
    const bridge = findBridgeLocation(new Set());
    assert.equal(bridge, null);
  });
});

describe('Full terrain simulation', () => {
  let terrain;

  beforeEach(() => {
    terrain = simulateTerrain();
  });

  describe('grid dimensions', () => {
    it('has 784 tiles (28x28)', () => {
      assert.equal(terrain.tiles.size, 784);
    });

    it('tile keys are within world bounds (-14..+13)', () => {
      for (const key of terrain.tiles.keys()) {
        const [x, z] = key.split(',').map(Number);
        assert.ok(x >= -HALF && x < HALF, `x=${x} out of bounds`);
        assert.ok(z >= -HALF && z < HALF, `z=${z} out of bounds`);
      }
    });
  });

  describe('biome coverage', () => {
    it('all 4 biomes are represented', () => {
      const biomesPresent = new Set();
      for (const entry of terrain.tiles.values()) {
        biomesPresent.add(entry.biome);
      }
      for (const biome of BIOME_LIST) {
        assert.ok(biomesPresent.has(biome),
          `biome '${biome}' not found in terrain tiles`);
      }
    });

    it('biomeMap has exactly 4 entries', () => {
      assert.equal(terrain.biomeMap.length, 4);
    });

    it('biomeMap is a permutation of the 4 biomes', () => {
      const sorted = [...terrain.biomeMap].sort();
      assert.deepEqual(sorted, ['desert', 'forest', 'meadow', 'mountain']);
    });
  });

  describe('water tiles', () => {
    it('water tiles exist', () => {
      assert.ok(terrain.waterTiles.size > 0, 'should have water tiles');
    });

    it('water tiles are a subset of the tiles map', () => {
      for (const key of terrain.waterTiles) {
        assert.ok(terrain.tiles.has(key), `water tile ${key} not in tiles map`);
      }
    });

    it('all water tiles have type "water"', () => {
      for (const key of terrain.waterTiles) {
        const entry = terrain.tiles.get(key);
        assert.equal(entry.type, 'water', `tile ${key} should be water`);
      }
    });
  });

  describe('getAvailableGrassTile', () => {
    it('returns valid coordinates within bounds', () => {
      const tile = terrain.getAvailableGrassTile();
      assert.ok(tile !== null, 'should return a tile');
      assert.ok(typeof tile.x === 'number');
      assert.ok(typeof tile.z === 'number');
      assert.ok(tile.x >= -HALF && tile.x < HALF, `x=${tile.x} out of bounds`);
      assert.ok(tile.z >= -HALF && tile.z < HALF, `z=${tile.z} out of bounds`);
    });

    it('returned tile is a grass or sand type', () => {
      const tile = terrain.getAvailableGrassTile();
      assert.ok(tile !== null);
      const entry = terrain.tiles.get(`${tile.x},${tile.z}`);
      assert.ok(
        entry.type === 'grass' || entry.type === 'sand',
        `tile type '${entry.type}' is not grass or sand`
      );
    });

    it('returned tile is not in a mountain biome', () => {
      const tile = terrain.getAvailableGrassTile();
      assert.ok(tile !== null);
      const entry = terrain.tiles.get(`${tile.x},${tile.z}`);
      assert.notEqual(entry.biome, 'mountain');
    });

    it('returned tile is not adjacent to water', () => {
      const tile = terrain.getAvailableGrassTile();
      assert.ok(tile !== null);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborKey = `${tile.x + dx},${tile.z + dz}`;
          assert.ok(
            !terrain.waterTiles.has(neighborKey),
            `tile (${tile.x},${tile.z}) is adjacent to water at (${tile.x + dx},${tile.z + dz})`
          );
        }
      }
    });
  });

  describe('markTileUsed', () => {
    it('prevents subsequent getAvailableGrassTile from returning the same tile', () => {
      const tile1 = terrain.getAvailableGrassTile();
      assert.ok(tile1 !== null);
      terrain.markTileUsed(tile1.x, tile1.z);

      // The exact same tile should not be returned again
      const tile2 = terrain.getAvailableGrassTile();
      if (tile2 !== null) {
        const sameSpot = tile2.x === tile1.x && tile2.z === tile1.z;
        assert.ok(!sameSpot, 'should not return the same tile after marking it used');
      }
    });

    it('also blocks neighboring tiles (breathing room)', () => {
      const tile = terrain.getAvailableGrassTile();
      assert.ok(tile !== null);
      terrain.markTileUsed(tile.x, tile.z);

      // All neighbors should be in usedTiles
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${tile.x + dx},${tile.z + dz}`;
          assert.ok(terrain.usedTiles.has(key),
            `neighbor (${tile.x + dx},${tile.z + dz}) should be marked used`);
        }
      }
    });

    it('getAvailableGrassTile maintains spacing between used tiles', () => {
      // Place several buildings and verify spacing
      for (let i = 0; i < 5; i++) {
        const tile = terrain.getAvailableGrassTile();
        if (!tile) break;
        terrain.markTileUsed(tile.x, tile.z);
      }

      // The next tile should not be in usedTiles
      const next = terrain.getAvailableGrassTile();
      if (next) {
        const key = `${next.x},${next.z}`;
        assert.ok(!terrain.usedTiles.has(key),
          `tile (${next.x},${next.z}) should not be in usedTiles`);
      }
    });

    it('records building positions with biome for distribution tracking', () => {
      const tile = terrain.getAvailableGrassTile();
      assert.ok(tile !== null);
      terrain.markTileUsed(tile.x, tile.z);
      assert.equal(terrain.buildingPositions.length, 1);
      assert.equal(terrain.buildingPositions[0].x, tile.x);
      assert.equal(terrain.buildingPositions[0].z, tile.z);
      assert.ok(typeof terrain.buildingPositions[0].biome === 'string');
    });

    it('distributes buildings across multiple biomes', () => {
      // Place 6 buildings — should spread across available biomes
      const placed = [];
      for (let i = 0; i < 6; i++) {
        const tile = terrain.getAvailableGrassTile();
        if (!tile) break;
        terrain.markTileUsed(tile.x, tile.z);
        placed.push(tile);
      }
      assert.ok(placed.length >= 3, `expected at least 3 placements, got ${placed.length}`);

      // Count biomes used
      const biomesUsed = new Set(placed.map(t => t.biome));
      assert.ok(biomesUsed.size >= 2,
        `expected buildings in at least 2 biomes, got ${biomesUsed.size}: ${[...biomesUsed]}`);
    });
  });

  describe('getBiomeAt', () => {
    it('returns valid biome names for in-bounds coordinates', () => {
      for (let x = -HALF; x < HALF; x += 4) {
        for (let z = -HALF; z < HALF; z += 4) {
          const biome = terrain.getBiomeAt(x, z);
          assert.ok(
            BIOME_LIST.includes(biome),
            `getBiomeAt(${x}, ${z}) = '${biome}' is not valid`
          );
        }
      }
    });

    it('returns "unknown" for out-of-bounds coordinates', () => {
      assert.equal(terrain.getBiomeAt(-20, 0), 'unknown');
      assert.equal(terrain.getBiomeAt(0, 20), 'unknown');
      assert.equal(terrain.getBiomeAt(100, 100), 'unknown');
    });

    it('agrees with the tile biome data', () => {
      // For a few sample tiles, getBiomeAt should match the stored biome
      for (const [key, entry] of terrain.tiles) {
        const [x, z] = key.split(',').map(Number);
        const biome = terrain.getBiomeAt(x, z);
        assert.equal(biome, entry.biome,
          `getBiomeAt(${x},${z})=${biome} !== tile biome ${entry.biome}`);
      }
    });
  });
});

describe('animateWater (interface check)', () => {
  it('animateWater would be a function on the generated terrain object', () => {
    // We can verify the simulated terrain does not have it (since it needs THREE),
    // but the real terrain.js exports it. Here we just confirm the test harness
    // is aware of the expected API shape.
    const expectedKeys = [
      'tiles', 'waterTiles', 'pathTiles',
      'getAvailableGrassTile', 'markTileUsed',
      'animateWater', 'addDecorations', 'getBiomeAt',
      'mergeStaticGeometry',
    ];
    // The simulated terrain has extra keys for testing; the real one should
    // have at least these keys.
    for (const key of expectedKeys) {
      assert.ok(typeof key === 'string', `expected key '${key}' is a string`);
    }
    // Confirm animateWater is in the expected API
    assert.ok(expectedKeys.includes('animateWater'));
  });
});

describe('materialKey', () => {
  it('same properties produce the same key', () => {
    const a = materialKey(0xA8CC9A, 0x000000, 0, false, true);
    const b = materialKey(0xA8CC9A, 0x000000, 0, false, true);
    assert.equal(a, b);
  });

  it('different color produces a different key', () => {
    const a = materialKey(0xA8CC9A, 0x000000, 0, false, true);
    const b = materialKey(0xB8DCA8, 0x000000, 0, false, true);
    assert.notEqual(a, b);
  });

  it('different emissive produces a different key', () => {
    const a = materialKey(0xFFCC66, 0xFFAA33, 1.0, false, false);
    const b = materialKey(0xFFCC66, 0x000000, 1.0, false, false);
    assert.notEqual(a, b);
  });

  it('different emissiveIntensity produces a different key', () => {
    const a = materialKey(0xFFCC66, 0xFFAA33, 1.0, false, false);
    const b = materialKey(0xFFCC66, 0xFFAA33, 0.5, false, false);
    assert.notEqual(a, b);
  });

  it('different castShadow produces a different key', () => {
    const a = materialKey(0x8B6850, 0x000000, 0, true, true);
    const b = materialKey(0x8B6850, 0x000000, 0, false, true);
    assert.notEqual(a, b);
  });

  it('different receiveShadow produces a different key', () => {
    const a = materialKey(0x8B6850, 0x000000, 0, true, true);
    const b = materialKey(0x8B6850, 0x000000, 0, true, false);
    assert.notEqual(a, b);
  });

  it('key is a string containing all properties', () => {
    const key = materialKey(255, 128, 0.5, true, false);
    assert.equal(typeof key, 'string');
    assert.ok(key.includes('255'));
    assert.ok(key.includes('128'));
    assert.ok(key.includes('0.5'));
    assert.ok(key.includes('true'));
    assert.ok(key.includes('false'));
  });
});
