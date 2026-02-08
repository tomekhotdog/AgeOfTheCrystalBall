// buildings.js -- Building mesh constructors with GR location theming.
import * as THREE from 'three';

const PALETTE = {
  grass: 0xA8D4A0,
  grassAlt: 0xBCDCAC,
  water: 0x68B8D8,
  path: 0xE8D4C0,
  dirt: 0xD4BC94,
  hill: 0x9CBC88,
  sandstone: 0xF5DCC0,
  stone: 0xD8C8B8,
  wood: 0xD0AC88,
  roof: 0xE09880,
  roofAlt: 0x88C4B8,
  babyBlue: 0x88C8E8,
  grYellow: 0xF0C880,
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

/** GR location display labels for each building type. */
export const BUILDING_LABELS = {
  Forge:       'Soho Place',
  Library:     'Res Lab',
  Chapel:      'Guernsey',
  Observatory: 'Signal Tower',
  Workshop:    'Dallas',
  Market:      'The Cafe',
  Farm:        'The Farm',
  LumberCamp:  'Stamford',
};

/**
 * Creates a building mesh group of the given type.
 * @param {string} type -- one of BUILDING_TYPES
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

// Warm window colour and emissive for night glow
const WIN_COLOR = 0xFFF0E0;
const WIN_EMISSIVE = 0xF0C8A0;

/** Non-shadow-casting warm PointLight for building night glow. Starts off. */
function nightGlow(y = 0.8) {
  const light = new THREE.PointLight(0xE8C4A0, 0, 3);
  light.name = 'buildingGlow';
  light.castShadow = false;
  light.position.set(0, y, 0);
  return light;
}

/** Warm emissive window mesh (driven by nightFactor). */
function win(geom, x, y, z) {
  const mesh = m(geom, WIN_COLOR, { emissive: WIN_EMISSIVE, emissiveIntensity: 0 });
  mesh.name = 'windowGlow';
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// 1. Forge / Soho Place -- squat sandstone building with chimney, GR banner
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

  // Warm glow (base 0.3 from forge fire, boosted at night)
  const glow = new THREE.PointLight(0xE8C4A0, 0.3, 3);
  glow.name = 'buildingGlow';
  glow.castShadow = false;
  glow.position.set(0, 0.5, 0.4);
  g.add(glow);

  // Door with warm interior glow
  g.add(win(new THREE.BoxGeometry(0.35, 0.55, 0.05), 0, 0.35, 0.72));

  // GR banner on front face (baby blue + yellow stripe)
  const bannerBg = m(new THREE.BoxGeometry(0.25, 0.35, 0.02), PALETTE.babyBlue);
  bannerBg.position.set(0.45, 0.7, 0.72);
  g.add(bannerBg);

  const bannerStripe = m(new THREE.BoxGeometry(0.25, 0.08, 0.025), PALETTE.grYellow);
  bannerStripe.position.set(0.45, 0.7, 0.73);
  g.add(bannerStripe);

  return g;
}

// ---------------------------------------------------------------------------
// 2. Library / Res Lab -- tall narrow stone building with dome + antenna
// ---------------------------------------------------------------------------
function buildLibrary() {
  const g = new THREE.Group();

  // Main body
  const body = m(new THREE.BoxGeometry(1.2, 1.8, 1.2), PALETTE.stone);
  body.position.set(0, 0.9, 0);
  g.add(body);

  // Half-sphere dome
  const dome = m(new THREE.SphereGeometry(0.7, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.roofAlt);
  dome.position.set(0, 1.8, 0);
  g.add(dome);

  // Night glow
  g.add(nightGlow(1.0));

  // Front windows (warm emissive for night glow)
  for (let i = -1; i <= 1; i += 2) {
    g.add(win(new THREE.BoxGeometry(0.15, 0.25, 0.05), i * 0.3, 1.1, 0.62));
  }

  // Side windows
  for (let i = -1; i <= 1; i += 2) {
    g.add(win(new THREE.BoxGeometry(0.05, 0.25, 0.15), 0.62, 1.1, i * 0.3));
  }

  // Antenna on the roof
  const antenna = m(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), PALETTE.stone);
  antenna.position.set(0, 2.4, 0);
  g.add(antenna);

  const antennaTip = m(new THREE.SphereGeometry(0.03, 6, 6), PALETTE.babyBlue);
  antennaTip.position.set(0, 2.62, 0);
  g.add(antennaTip);

  return g;
}

// ---------------------------------------------------------------------------
// 3. Chapel / Guernsey -- box base with cone spire (coastal stone tint)
// ---------------------------------------------------------------------------
function buildChapel() {
  const g = new THREE.Group();

  // Base -- coastal stone tint (slightly bluer)
  const coastalStone = 0xDCD8D4;
  const body = m(new THREE.BoxGeometry(1.4, 1.2, 1.6), coastalStone);
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
  const tower = m(new THREE.BoxGeometry(0.5, 0.6, 0.5), coastalStone);
  tower.position.set(0, 1.5, -0.4);
  g.add(tower);

  const spire = m(new THREE.ConeGeometry(0.35, 0.9, 8), PALETTE.roof);
  spire.position.set(0, 2.25, -0.4);
  g.add(spire);

  // Night glow
  g.add(nightGlow(0.8));

  // Door
  const door = m(new THREE.BoxGeometry(0.3, 0.5, 0.05), 0x3A2A1A);
  door.position.set(0, 0.3, 0.82);
  g.add(door);

  // Window above door
  g.add(win(new THREE.BoxGeometry(0.2, 0.2, 0.05), 0, 0.85, 0.82));

  return g;
}

// ---------------------------------------------------------------------------
// 4. Observatory / Signal Tower -- cylinder base with dome and telescope arm
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

  // Dome slit
  const slit = m(new THREE.BoxGeometry(0.08, 0.02, 0.9), 0x4A5060);
  slit.position.set(0, 1.8, 0);
  g.add(slit);

  // Telescope arm
  const telescope = m(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), PALETTE.wood);
  telescope.position.set(0.2, 2.0, 0);
  telescope.rotation.z = -0.5;
  g.add(telescope);

  // Telescope lens
  const lens = m(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), 0x88AAB8);
  lens.position.set(0.65, 2.25, 0);
  g.add(lens);

  // Night glow
  g.add(nightGlow(1.0));

  // Window on base
  g.add(win(new THREE.BoxGeometry(0.12, 0.2, 0.05), 0, 0.8, 0.92));

  return g;
}

// ---------------------------------------------------------------------------
// 5. Workshop / Dallas -- open flat roof on 4 posts with server rack shapes
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

  // Server rack shapes on workbenches (tall thin boxes)
  const rackColor = 0x484848;
  const rack1 = m(new THREE.BoxGeometry(0.06, 0.2, 0.08), rackColor);
  rack1.position.set(-0.35, 0.40, -0.2);
  g.add(rack1);

  const rack2 = m(new THREE.BoxGeometry(0.06, 0.18, 0.08), rackColor);
  rack2.position.set(-0.22, 0.39, -0.2);
  g.add(rack2);

  const rack3 = m(new THREE.BoxGeometry(0.06, 0.15, 0.08), rackColor);
  rack3.position.set(0.35, 0.33, 0.3);
  g.add(rack3);

  // LED indicator lights on racks
  const led1 = m(new THREE.BoxGeometry(0.015, 0.015, 0.01), 0xA0D8A8);
  led1.position.set(-0.35, 0.48, -0.16);
  g.add(led1);

  const led2 = m(new THREE.BoxGeometry(0.015, 0.015, 0.01), PALETTE.babyBlue);
  led2.position.set(-0.22, 0.46, -0.16);
  g.add(led2);

  // Night glow
  g.add(nightGlow(1.2));

  // Warm hanging bulb under roof
  g.add(win(new THREE.SphereGeometry(0.05, 6, 6), 0, 1.3, 0));

  return g;
}

// ---------------------------------------------------------------------------
// 6. Market / The Cafe -- canopies with coffee cup shapes
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

  // Night glow
  g.add(nightGlow(0.9));

  // Warm lamps under canopies
  g.add(win(new THREE.SphereGeometry(0.04, 6, 6), -0.3, 1.1, -0.2));
  g.add(win(new THREE.SphereGeometry(0.04, 6, 6),  0.3, 0.9, 0.6));

  // Coffee cup shapes on the stalls (warm palette)
  const cupColor = 0xF5F5F0;
  const coffeeColor = 0x3B2313;
  for (let i = 0; i < 3; i++) {
    const cup = m(new THREE.CylinderGeometry(0.04, 0.035, 0.06, 8), cupColor);
    cup.position.set(-0.35 + i * 0.35, 0.08, -0.15);
    g.add(cup);
    // Coffee inside
    const coffee = m(new THREE.CylinderGeometry(0.032, 0.032, 0.01, 8), coffeeColor);
    coffee.position.set(-0.35 + i * 0.35, 0.115, -0.15);
    g.add(coffee);
  }

  return g;
}

// ---------------------------------------------------------------------------
// 7. Farm / The Farm -- low walls with baby-blue compute pods
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

  // Compute pods (baby-blue boxes replacing green crops)
  const podColors = [0xA8D0E0, 0x9CC8D8, 0xB4D8E8];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const ci = (row + col) % podColors.length;
      const pod = m(new THREE.BoxGeometry(0.3, 0.15, 0.2), podColors[ci]);
      pod.position.set(-0.55 + col * 0.38, 0.075, -0.45 + row * 0.45);
      g.add(pod);
      // Small LED indicator on each pod
      const led = m(new THREE.BoxGeometry(0.02, 0.02, 0.01), 0xA0D8A8);
      led.position.set(-0.55 + col * 0.38 + 0.1, 0.16, -0.45 + row * 0.45 + 0.1);
      g.add(led);
    }
  }

  // Night glow
  g.add(nightGlow(0.5));

  // Gate lamp
  g.add(win(new THREE.SphereGeometry(0.04, 6, 6), 0, 0.45, 0.9));

  // Gate opening post markers
  const postL = m(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), PALETTE.wood);
  postL.position.set(-0.15, 0.2, 0.9);
  g.add(postL);

  const postR = m(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), PALETTE.wood);
  postR.position.set(0.15, 0.2, 0.9);
  g.add(postR);

  // Satellite dish
  const dish = m(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.stone);
  dish.position.set(0.7, 0.35, -0.7);
  dish.rotation.x = 0.3;
  g.add(dish);

  const dishPole = m(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4), PALETTE.stone);
  dishPole.position.set(0.7, 0.2, -0.7);
  g.add(dishPole);

  return g;
}

// ---------------------------------------------------------------------------
// 8. LumberCamp / Stamford -- open shelter with flat roof and stacked logs
// ---------------------------------------------------------------------------
function buildLumberCamp() {
  const g = new THREE.Group();

  // Shelter posts (lean-to)
  const postPositions = [
    [-0.6, 0, -0.5],
    [ 0.6, 0, -0.5],
    [-0.6, 0,  0.5],
    [ 0.6, 0,  0.5],
  ];
  const heights = [1.3, 1.3, 0.9, 0.9];
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

  // Night glow
  g.add(nightGlow(0.9));

  // Warm shelter light
  g.add(win(new THREE.SphereGeometry(0.05, 6, 6), 0, 0.9, 0));

  // Stacked logs
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

  // Axe (decorative)
  const handle = m(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), PALETTE.wood);
  handle.position.set(0.5, 0.3, 0.3);
  handle.rotation.z = 0.3;
  g.add(handle);

  const head = m(new THREE.BoxGeometry(0.12, 0.08, 0.04), PALETTE.stone);
  head.position.set(0.42, 0.48, 0.3);
  g.add(head);

  return g;
}
