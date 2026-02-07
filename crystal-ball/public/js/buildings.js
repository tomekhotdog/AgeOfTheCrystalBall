// buildings.js — Building mesh constructors, one per building type.
import * as THREE from 'three';

const PALETTE = {
  grass: 0xA8CC9A,
  grassAlt: 0xB8DCA8,
  water: 0x4AACE8,
  path: 0xDED4BC,
  dirt: 0xC0AA82,
  hill: 0x96AA86,
  sandstone: 0xE2CCA8,
  stone: 0xB8B0A0,
  wood: 0xA88A62,
  roof: 0xCC7048,
  roofAlt: 0x7A9E8E,
};

export const BUILDING_TYPES = [
  'Forge',
  'Library',
  'Chapel',
  'Observatory',
  'Workshop',
  'Market',
  'Farm',
  'LumberCamp',
];

/**
 * Creates a building mesh group of the given type.
 * @param {string} type — one of BUILDING_TYPES
 * @returns {THREE.Group}
 */
export function createBuilding(type) {
  const builders = {
    Forge: buildForge,
    Library: buildLibrary,
    Chapel: buildChapel,
    Observatory: buildObservatory,
    Workshop: buildWorkshop,
    Market: buildMarket,
    Farm: buildFarm,
    LumberCamp: buildLumberCamp,
  };

  const fn = builders[type];
  if (!fn) {
    console.warn(`Unknown building type "${type}", falling back to Forge.`);
    return buildForge();
  }

  const group = fn();
  group.userData = { type: 'building', buildingType: type };
  return group;
}

// ---------------------------------------------------------------------------
// Helper: create a mesh with shadow casting
// ---------------------------------------------------------------------------
function m(geometry, color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    ...(opts.emissive !== undefined ? { emissive: opts.emissive } : {}),
    ...(opts.emissiveIntensity !== undefined ? { emissiveIntensity: opts.emissiveIntensity } : {}),
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// 1. Forge — squat sandstone building with chimney and inner glow
// ---------------------------------------------------------------------------
function buildForge() {
  const g = new THREE.Group();

  // Main body
  const body = m(new THREE.BoxGeometry(1.6, 1.0, 1.4), PALETTE.sandstone);
  body.position.set(0, 0.5, 0);
  g.add(body);

  // Flat roof slab
  const roof = m(new THREE.BoxGeometry(1.8, 0.1, 1.6), PALETTE.dirt);
  roof.position.set(0, 1.05, 0);
  g.add(roof);

  // Chimney
  const chimney = m(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), PALETTE.stone);
  chimney.position.set(0.5, 1.5, -0.3);
  g.add(chimney);

  // Chimney cap
  const cap = m(new THREE.CylinderGeometry(0.25, 0.18, 0.1, 8), PALETTE.stone);
  cap.position.set(0.5, 1.95, -0.3);
  g.add(cap);

  // Inner glow (point light)
  const glow = new THREE.PointLight(0xFF8844, 0.6, 3);
  glow.position.set(0, 0.5, 0.4);
  g.add(glow);

  // Door cutout hint (dark rectangle)
  const door = m(new THREE.BoxGeometry(0.35, 0.55, 0.05), 0x3A2A1A);
  door.position.set(0, 0.35, 0.72);
  g.add(door);

  return g;
}

// ---------------------------------------------------------------------------
// 2. Library — tall narrow stone building with dome
// ---------------------------------------------------------------------------
function buildLibrary() {
  const g = new THREE.Group();

  // Main body — tall and narrow
  const body = m(new THREE.BoxGeometry(1.2, 1.8, 1.2), PALETTE.stone);
  body.position.set(0, 0.9, 0);
  g.add(body);

  // Half-sphere dome
  const dome = m(new THREE.SphereGeometry(0.7, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.roofAlt);
  dome.position.set(0, 1.8, 0);
  g.add(dome);

  // Window cutout hints (small bright rectangles)
  for (let i = -1; i <= 1; i += 2) {
    const win = m(new THREE.BoxGeometry(0.15, 0.25, 0.05), 0xEEDDCC);
    win.position.set(i * 0.3, 1.1, 0.62);
    g.add(win);
  }

  // Side windows
  for (let i = -1; i <= 1; i += 2) {
    const win = m(new THREE.BoxGeometry(0.05, 0.25, 0.15), 0xEEDDCC);
    win.position.set(0.62, 1.1, i * 0.3);
    g.add(win);
  }

  return g;
}

// ---------------------------------------------------------------------------
// 3. Chapel — box base with cone spire and door
// ---------------------------------------------------------------------------
function buildChapel() {
  const g = new THREE.Group();

  // Base
  const body = m(new THREE.BoxGeometry(1.4, 1.2, 1.6), PALETTE.sandstone);
  body.position.set(0, 0.6, 0);
  g.add(body);

  // Gable roof
  const roofL = m(new THREE.BoxGeometry(1.6, 0.1, 1.1), PALETTE.roof);
  roofL.position.set(0, 1.35, -0.25);
  roofL.rotation.x = -0.35;
  g.add(roofL);

  const roofR = m(new THREE.BoxGeometry(1.6, 0.1, 1.1), PALETTE.roof);
  roofR.position.set(0, 1.35, 0.25);
  roofR.rotation.x = 0.35;
  g.add(roofR);

  // Spire tower
  const tower = m(new THREE.BoxGeometry(0.5, 0.6, 0.5), PALETTE.sandstone);
  tower.position.set(0, 1.5, -0.4);
  g.add(tower);

  const spire = m(new THREE.ConeGeometry(0.35, 0.9, 8), PALETTE.roof);
  spire.position.set(0, 2.25, -0.4);
  g.add(spire);

  // Door
  const door = m(new THREE.BoxGeometry(0.3, 0.5, 0.05), 0x3A2A1A);
  door.position.set(0, 0.3, 0.82);
  g.add(door);

  return g;
}

// ---------------------------------------------------------------------------
// 4. Observatory — cylinder base with dome and telescope arm
// ---------------------------------------------------------------------------
function buildObservatory() {
  const g = new THREE.Group();

  // Cylinder base
  const base = m(new THREE.CylinderGeometry(0.8, 0.9, 1.4, 12), PALETTE.stone);
  base.position.set(0, 0.7, 0);
  g.add(base);

  // Half-sphere dome
  const dome = m(new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.roofAlt);
  dome.position.set(0, 1.4, 0);
  g.add(dome);

  // Dome slit (narrow opening)
  const slit = m(new THREE.BoxGeometry(0.08, 0.02, 0.9), 0x2A3A4A);
  slit.position.set(0, 1.8, 0);
  g.add(slit);

  // Telescope arm — thin cylinder angled upward
  const telescope = m(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), PALETTE.wood);
  telescope.position.set(0.2, 2.0, 0);
  telescope.rotation.z = -0.5;
  g.add(telescope);

  // Telescope lens
  const lens = m(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), 0x5588AA);
  lens.position.set(0.65, 2.25, 0);
  g.add(lens);

  return g;
}

// ---------------------------------------------------------------------------
// 5. Workshop — open flat roof on 4 posts with benches
// ---------------------------------------------------------------------------
function buildWorkshop() {
  const g = new THREE.Group();

  // 4 corner posts
  const postPositions = [
    [-0.7, 0, -0.7],
    [ 0.7, 0, -0.7],
    [-0.7, 0,  0.7],
    [ 0.7, 0,  0.7],
  ];
  for (const [px, , pz] of postPositions) {
    const post = m(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), PALETTE.wood);
    post.position.set(px, 0.7, pz);
    g.add(post);
  }

  // Flat roof
  const roof = m(new THREE.BoxGeometry(1.7, 0.08, 1.7), PALETTE.wood);
  roof.position.set(0, 1.42, 0);
  g.add(roof);

  // Workbenches
  const bench1 = m(new THREE.BoxGeometry(0.6, 0.3, 0.35), PALETTE.sandstone);
  bench1.position.set(-0.3, 0.15, -0.2);
  g.add(bench1);

  const bench2 = m(new THREE.BoxGeometry(0.5, 0.25, 0.35), PALETTE.sandstone);
  bench2.position.set(0.35, 0.125, 0.3);
  g.add(bench2);

  // Small tool on bench (anvil-like)
  const tool = m(new THREE.BoxGeometry(0.15, 0.1, 0.1), PALETTE.stone);
  tool.position.set(-0.3, 0.35, -0.2);
  g.add(tool);

  return g;
}

// ---------------------------------------------------------------------------
// 6. Market — two angled roof canopies on posts, open-air feel
// ---------------------------------------------------------------------------
function buildMarket() {
  const g = new THREE.Group();

  // Posts for canopy 1
  for (const [px, pz] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.1], [0.6, 0.1]]) {
    const post = m(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), PALETTE.wood);
    post.position.set(px, 0.6, pz);
    g.add(post);
  }

  // Canopy 1
  const canopy1 = m(new THREE.BoxGeometry(1.4, 0.06, 0.8), PALETTE.roof);
  canopy1.position.set(0, 1.22, -0.2);
  canopy1.rotation.z = 0.08;
  g.add(canopy1);

  // Posts for canopy 2
  for (const [px, pz] of [[-0.6, 0.3], [0.6, 0.3], [-0.6, 0.9], [0.6, 0.9]]) {
    const post = m(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), PALETTE.wood);
    post.position.set(px, 0.5, pz);
    g.add(post);
  }

  // Canopy 2
  const canopy2 = m(new THREE.BoxGeometry(1.4, 0.06, 0.8), PALETTE.roofAlt);
  canopy2.position.set(0, 1.02, 0.6);
  canopy2.rotation.z = -0.06;
  g.add(canopy2);

  // Market goods — small crates
  for (let i = 0; i < 3; i++) {
    const crate = m(new THREE.BoxGeometry(0.2, 0.15, 0.2), [PALETTE.sandstone, PALETTE.dirt, PALETTE.wood][i]);
    crate.position.set(-0.35 + i * 0.35, 0.08, -0.15);
    g.add(crate);
  }

  return g;
}

// ---------------------------------------------------------------------------
// 7. Farm — low walls enclosing crop rows
// ---------------------------------------------------------------------------
function buildFarm() {
  const g = new THREE.Group();

  // Fence walls (low)
  const wallN = m(new THREE.BoxGeometry(2.0, 0.25, 0.08), PALETTE.wood);
  wallN.position.set(0, 0.125, -0.9);
  g.add(wallN);

  const wallS = m(new THREE.BoxGeometry(2.0, 0.25, 0.08), PALETTE.wood);
  wallS.position.set(0, 0.125, 0.9);
  g.add(wallS);

  const wallW = m(new THREE.BoxGeometry(0.08, 0.25, 1.8), PALETTE.wood);
  wallW.position.set(-0.96, 0.125, 0);
  g.add(wallW);

  const wallE = m(new THREE.BoxGeometry(0.08, 0.25, 1.8), PALETTE.wood);
  wallE.position.set(0.96, 0.125, 0);
  g.add(wallE);

  // Crop rows — small green boxes
  const cropColors = [0x82B272, 0x92C282, 0x74A464];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const ci = (row + col) % cropColors.length;
      const crop = m(new THREE.BoxGeometry(0.3, 0.12, 0.2), cropColors[ci]);
      crop.position.set(-0.55 + col * 0.38, 0.06, -0.45 + row * 0.45);
      g.add(crop);
    }
  }

  // Gate opening hint (small gap in south wall already covered, add post markers)
  const postL = m(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), PALETTE.wood);
  postL.position.set(-0.15, 0.2, 0.9);
  g.add(postL);

  const postR = m(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), PALETTE.wood);
  postR.position.set(0.15, 0.2, 0.9);
  g.add(postR);

  return g;
}

// ---------------------------------------------------------------------------
// 8. LumberCamp — open shelter with flat roof and stacked logs
// ---------------------------------------------------------------------------
function buildLumberCamp() {
  const g = new THREE.Group();

  // Shelter posts (only 2 on one side for lean-to)
  const postPositions = [
    [-0.6, 0, -0.5],
    [ 0.6, 0, -0.5],
    [-0.6, 0,  0.5],
    [ 0.6, 0,  0.5],
  ];
  const heights = [1.3, 1.3, 0.9, 0.9]; // lean-to slope
  postPositions.forEach(([px, , pz], i) => {
    const h = heights[i];
    const post = m(new THREE.CylinderGeometry(0.06, 0.06, h, 6), PALETTE.wood);
    post.position.set(px, h / 2, pz);
    g.add(post);
  });

  // Sloped roof
  const roof = m(new THREE.BoxGeometry(1.4, 0.06, 1.2), PALETTE.roofAlt);
  roof.position.set(0, 1.1, 0);
  roof.rotation.x = 0.2;
  g.add(roof);

  // Stacked logs (cylinders on their side)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const log = m(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), PALETTE.wood);
      log.rotation.z = Math.PI / 2;
      log.position.set(
        0,
        0.1 + row * 0.17,
        -0.3 + col * 0.22
      );
      g.add(log);
    }
  }

  // Axe (decorative) — handle + head
  const handle = m(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), PALETTE.wood);
  handle.position.set(0.5, 0.3, 0.3);
  handle.rotation.z = 0.3;
  g.add(handle);

  const head = m(new THREE.BoxGeometry(0.12, 0.08, 0.04), PALETTE.stone);
  head.position.set(0.42, 0.48, 0.3);
  g.add(head);

  return g;
}
