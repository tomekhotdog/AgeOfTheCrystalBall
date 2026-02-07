// units.js — Class-based unit system with persistent names and rank badges.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palette & Constants
// ---------------------------------------------------------------------------

const PALETTE = {
  unitBody:    0xD4B892,
  unitHead:    0xF0E0D0,
};

// ---------------------------------------------------------------------------
// Geometry & Material Caches
// ---------------------------------------------------------------------------
// Shared geometry: safe because geometry is never modified after creation.
// Shared accessory materials: safe because they are never modified at runtime.
// Body/head materials are NOT shared — stateVisuals modifies them per-unit.

const _geomCache = new Map();
function cachedGeom(key, factory) {
  if (!_geomCache.has(key)) _geomCache.set(key, factory());
  return _geomCache.get(key);
}

const _accessoryMatCache = new Map();
function cachedMat(key, factory) {
  if (!_accessoryMatCache.has(key)) _accessoryMatCache.set(key, factory());
  return _accessoryMatCache.get(key);
}

/** Class-specific accent colours. */
const CLASS_COLORS = {
  Builder:  0xF09448,
  Scholar:  0x5498CC,
  Scout:    0x8ECF9A,
  Sentinel: 0xF0D858,
  Veteran:  0xB08EEC,
  Ghost:    0x888888,
  Peasant:  0xB0B0B0,
};

/** Medieval names for deterministic assignment via PID. */
const NAMES = [
  'Aldric', 'Bronwyn', 'Cedric', 'Daphne', 'Edric',
  'Freya', 'Gareth', 'Helena', 'Isolde', 'Jasper',
  'Kiera', 'Leoric', 'Maren', 'Nolan', 'Orin',
  'Petra', 'Quinn', 'Rowan', 'Sable', 'Theron',
  'Una', 'Valen', 'Wren', 'Xara', 'Yorick', 'Zara',
  'Alaric', 'Brigid', 'Corin', 'Dagny', 'Elara',
  'Finn', 'Gilda', 'Hector', 'Ingrid', 'Jorin',
  'Lyra', 'Magnus', 'Niamh', 'Oswin', 'Rosalind',
  'Silas', 'Tamsin', 'Ulric', 'Vivienne', 'Wulfric',
];

/** Legacy accessory set used only for unclassed "Peasant" units. */
const LEGACY_ACCESSORIES = ['laptop', 'crystalStaff', 'bookStack', 'magnifyingGlass', 'flask'];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Determines a unit's class from session data.
 * Priority: Ghost > Scout > Builder > Sentinel > Veteran > Scholar > Peasant.
 * @param {{ state: string, has_children: boolean, age_seconds: number }} session
 * @returns {string} Class name.
 */
export function classifyUnit(session) {
  const { state, has_children, age_seconds } = session;

  if (state === 'stale')                                      return 'Ghost';
  if (age_seconds < 120)                                      return 'Scout';
  if (state === 'active' && has_children)                     return 'Builder';
  if (state === 'awaiting')                                   return 'Sentinel';
  if (age_seconds > 3600 && state === 'active')               return 'Veteran';
  if (state === 'active')                                     return 'Scholar';
  return 'Peasant';
}

// ---------------------------------------------------------------------------
// Persistent Names
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic medieval name for the given PID.
 * @param {number} pid
 * @returns {string}
 */
export function nameFromPid(pid) {
  return NAMES[pid % NAMES.length];
}

// ---------------------------------------------------------------------------
// Rank Badges
// ---------------------------------------------------------------------------

/**
 * Returns a rank tier string based on session age, or null for recruits.
 * @param {number} ageSeconds
 * @returns {string|null}
 */
export function rankFromAge(ageSeconds) {
  if (ageSeconds < 300)  return null;       // Recruit — no badge
  if (ageSeconds < 1800) return 'bronze';   // Apprentice
  if (ageSeconds < 7200) return 'silver';   // Journeyman
  return 'gold';                            // Master
}

/** Creates a small sphere pip above the head for the given rank. */
function buildRankBadge(rank) {
  const colorMap  = { bronze: 0xCD7F32, silver: 0xC0C0C0, gold: 0xFFD700 };
  const matOpts   = { color: colorMap[rank] };

  if (rank === 'gold') {
    matOpts.emissive          = 0xFFD700;
    matOpts.emissiveIntensity = 0.3;
  }

  const pip = new THREE.Mesh(
    cachedGeom('rankPip', () => new THREE.SphereGeometry(0.03, 8, 8)),
    cachedMat(`rank-${rank}`, () => new THREE.MeshLambertMaterial(matOpts)),
  );
  pip.position.set(0, 0.72, 0);
  pip.name = 'rankBadge';
  return pip;
}

// ---------------------------------------------------------------------------
// Unit Factory
// ---------------------------------------------------------------------------

/**
 * Creates a unit (villager) mesh group based on session data.
 * @param {{ id: string, pid: number, state: string, has_children: boolean, age_seconds: number }} session
 * @returns {THREE.Group}
 */
export function createUnit(session) {
  const group     = new THREE.Group();
  const unitClass = classifyUnit(session);
  const accent    = CLASS_COLORS[unitClass] ?? CLASS_COLORS.Peasant;

  // --- Body dimensions per class ---
  const bodyDims = classDimensions(unitClass);
  const bodyGeom = cachedGeom(`body-${unitClass}`, () =>
    new THREE.CylinderGeometry(bodyDims.radiusTop, bodyDims.radiusBottom, bodyDims.height, 8));
  const bodyMat = new THREE.MeshLambertMaterial({
    color:       PALETTE.unitBody,
    transparent: unitClass === 'Ghost',
    opacity:     unitClass === 'Ghost' ? 0.3 : 1.0,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y  = bodyDims.height / 2 + 0.05;
  body.castShadow  = true;
  body.name         = 'body';
  group.add(body);

  // --- Head ---
  const headMat = new THREE.MeshLambertMaterial({
    color:       PALETTE.unitHead,
    transparent: unitClass === 'Ghost',
    opacity:     unitClass === 'Ghost' ? 0.3 : 1.0,
  });
  const headGeom = cachedGeom('head', () => new THREE.SphereGeometry(0.12, 8, 8));
  const head = new THREE.Mesh(headGeom, headMat);
  head.position.y  = bodyDims.height + 0.17;
  head.castShadow  = true;
  head.name         = 'head';
  group.add(head);

  // Scale down Scouts.
  if (unitClass === 'Scout') group.scale.setScalar(0.8);

  // --- Class-specific accessory ---
  const accessory = buildClassAccessory(unitClass, accent, session);
  if (accessory) {
    accessory.name = 'accessory';
    group.add(accessory);
  }

  // --- Rank badge ---
  const rank = rankFromAge(session.age_seconds ?? 0);
  if (rank) group.add(buildRankBadge(rank));

  // --- Persistent name ---
  const unitName = nameFromPid(session.pid ?? hashStringToIndex(session.id || '', NAMES.length));

  // --- User data ---
  group.userData = {
    type:       'unit',
    sessionId:  session.id,
    unitClass,
    unitName,
    rank,
    baseY: 0,
    baseX: 0,
    baseZ: 0,
  };

  return group;
}

// ---------------------------------------------------------------------------
// Body Dimensions
// ---------------------------------------------------------------------------

/** Returns cylinder parameters per class. */
function classDimensions(unitClass) {
  switch (unitClass) {
    case 'Builder':  return { radiusTop: 0.18, radiusBottom: 0.21, height: 0.4  };
    case 'Scholar':  return { radiusTop: 0.13, radiusBottom: 0.15, height: 0.45 };
    default:         return { radiusTop: 0.15, radiusBottom: 0.18, height: 0.4  };
  }
}

// ---------------------------------------------------------------------------
// Class Accessories
// ---------------------------------------------------------------------------

/** Dispatches to the correct accessory builder for a class. */
function buildClassAccessory(unitClass, accent, session) {
  switch (unitClass) {
    case 'Builder':  return buildHammer(accent);
    case 'Scholar':  return buildFloatingBook(accent);
    case 'Scout':    return buildLantern(accent);
    case 'Sentinel': return buildShield(accent);
    case 'Veteran':  return buildCape(accent);
    case 'Peasant':  return buildLegacyAccessory(session);
    default:         return null; // Ghost gets nothing.
  }
}

/** Builder — small box head + cylinder handle. */
function buildHammer(color) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(
    cachedGeom('hammer-head', () => new THREE.BoxGeometry(0.06, 0.04, 0.04)),
    cachedMat(`hammer-accent-${color}`, () => new THREE.MeshLambertMaterial({ color })),
  );
  head.position.set(0.22, 0.48, 0);
  head.castShadow = true;
  g.add(head);

  const handle = new THREE.Mesh(
    cachedGeom('hammer-handle', () => new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6)),
    cachedMat('wood-handle', () => new THREE.MeshLambertMaterial({ color: 0x6B5A3E })),
  );
  handle.position.set(0.22, 0.38, 0);
  handle.castShadow = true;
  g.add(handle);
  return g;
}

/** Scholar — flat box floating above head, like an open book. */
function buildFloatingBook(color) {
  const book = new THREE.Mesh(
    cachedGeom('book', () => new THREE.BoxGeometry(0.1, 0.015, 0.07)),
    cachedMat(`book-${color}`, () => new THREE.MeshLambertMaterial({ color })),
  );
  book.position.set(0, 0.76, 0);
  book.rotation.y = 0.25;
  book.castShadow = true;
  return book;
}

/** Scout — small glowing sphere with a thin wire frame, warm light. */
function buildLantern(color) {
  const g = new THREE.Group();
  const globe = new THREE.Mesh(
    cachedGeom('lantern-globe', () => new THREE.SphereGeometry(0.03, 8, 8)),
    cachedMat(`lantern-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, emissive: 0xFFCC66, emissiveIntensity: 0.6 })),
  );
  globe.position.set(0.2, 0.38, 0.08);
  g.add(globe);

  const wire = new THREE.Mesh(
    cachedGeom('lantern-wire', () => new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4)),
    cachedMat('wood-handle', () => new THREE.MeshLambertMaterial({ color: 0x6B5A3E })),
  );
  wire.position.set(0.2, 0.30, 0.08);
  wire.castShadow = true;
  g.add(wire);
  return g;
}

/** Sentinel — flat gold shield attached to the side. */
function buildShield(color) {
  const shield = new THREE.Mesh(
    cachedGeom('shield', () => new THREE.BoxGeometry(0.12, 0.14, 0.015)),
    cachedMat(`shield-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 })),
  );
  shield.position.set(-0.2, 0.3, 0);
  shield.castShadow = true;
  return shield;
}

/** Veteran — flat plane behind the body acting as a cape. */
function buildCape(color) {
  const cape = new THREE.Mesh(
    cachedGeom('cape', () => new THREE.PlaneGeometry(0.22, 0.3)),
    cachedMat(`cape-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })),
  );
  cape.position.set(0, 0.3, -0.15);
  cape.castShadow = true;
  return cape;
}

/** Peasant fallback — picks a deterministic legacy accessory based on session ID. */
function buildLegacyAccessory(session) {
  const idx = hashStringToIndex(session?.id || '', LEGACY_ACCESSORIES.length);
  const type = LEGACY_ACCESSORIES[idx];
  return buildLegacyItem(type);
}

function buildLegacyItem(type) {
  switch (type) {
    case 'laptop':           return buildLaptop();
    case 'crystalStaff':     return buildCrystalStaff();
    case 'bookStack':        return buildBookStack();
    case 'magnifyingGlass':  return buildMagnifyingGlass();
    case 'flask':            return buildFlask();
    default:                 return null;
  }
}

// ---------------------------------------------------------------------------
// Legacy Accessory Builders (retained for Peasant class)
// ---------------------------------------------------------------------------

function buildLaptop() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    cachedGeom('laptop-base', () => new THREE.BoxGeometry(0.12, 0.01, 0.08)),
    cachedMat('laptop-base', () => new THREE.MeshLambertMaterial({ color: 0x3A3A3A })),
  );
  base.position.set(0.2, 0.2, 0);
  base.castShadow = true;
  g.add(base);
  const screen = new THREE.Mesh(
    cachedGeom('laptop-screen', () => new THREE.BoxGeometry(0.11, 0.08, 0.005)),
    cachedMat('laptop-screen', () => new THREE.MeshLambertMaterial({ color: 0x4488BB, emissive: 0x223344, emissiveIntensity: 0.3 })),
  );
  screen.position.set(0.2, 0.26, -0.035);
  screen.castShadow = true;
  screen.rotation.x = -0.3;
  g.add(screen);
  return g;
}

function buildCrystalStaff() {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(
    cachedGeom('staff-rod', () => new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6)),
    cachedMat('wood-handle', () => new THREE.MeshLambertMaterial({ color: 0x6B5A3E })),
  );
  rod.position.set(-0.18, 0.35, 0);
  rod.castShadow = true;
  g.add(rod);
  const orb = new THREE.Mesh(
    cachedGeom('crystal-orb', () => new THREE.SphereGeometry(0.04, 8, 8)),
    cachedMat('crystal-orb', () => new THREE.MeshLambertMaterial({ color: 0xA07EDC, emissive: 0xA07EDC, emissiveIntensity: 0.5 })),
  );
  orb.position.set(-0.18, 0.55, 0);
  orb.castShadow = true;
  orb.name = 'crystalOrb';
  g.add(orb);
  return g;
}

function buildBookStack() {
  const g = new THREE.Group();
  [0x8B3030, 0x2B5B8B, 0x3B7B3B].forEach((c, i) => {
    const b = new THREE.Mesh(
      cachedGeom('bookstack-book', () => new THREE.BoxGeometry(0.08, 0.02, 0.06)),
      cachedMat(`bookstack-${c}`, () => new THREE.MeshLambertMaterial({ color: c })),
    );
    b.position.set(0, 0.67 + i * 0.025, 0);
    b.rotation.y = i * 0.3;
    b.castShadow  = true;
    g.add(b);
  });
  return g;
}

function buildMagnifyingGlass() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    cachedGeom('magnify-ring', () => new THREE.TorusGeometry(0.04, 0.01, 8, 8)),
    cachedMat('magnify-ring', () => new THREE.MeshLambertMaterial({ color: 0xCCAA44 })),
  );
  ring.position.set(0.2, 0.42, 0.05);
  ring.rotation.y = Math.PI / 4;
  ring.castShadow = true;
  g.add(ring);
  const handle = new THREE.Mesh(
    cachedGeom('magnify-handle', () => new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6)),
    cachedMat('wood-handle', () => new THREE.MeshLambertMaterial({ color: 0x6B5A3E })),
  );
  handle.position.set(0.2, 0.34, 0.05);
  handle.rotation.z = 0.2;
  handle.castShadow = true;
  g.add(handle);
  return g;
}

function buildFlask() {
  const g = new THREE.Group();
  const flask = new THREE.Mesh(
    cachedGeom('flask-body', () => new THREE.ConeGeometry(0.04, 0.08, 6)),
    cachedMat('flask-body', () =>
      new THREE.MeshLambertMaterial({ color: 0x44AA55, emissive: 0x22DD44, emissiveIntensity: 0.35 })),
  );
  flask.position.set(0.18, 0.22, 0.1);
  flask.rotation.x = Math.PI;
  flask.castShadow  = true;
  g.add(flask);
  const neck = new THREE.Mesh(
    cachedGeom('flask-neck', () => new THREE.CylinderGeometry(0.015, 0.02, 0.03, 6)),
    cachedMat('flask-neck', () => new THREE.MeshLambertMaterial({ color: 0x44AA55 })),
  );
  neck.position.set(0.18, 0.27, 0.1);
  neck.castShadow = true;
  g.add(neck);
  return g;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Simple string hash to deterministic index. */
export function hashStringToIndex(str, range) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return ((hash % range) + range) % range;
}

/** Expose caches for testing. */
export { _geomCache, _accessoryMatCache };
