// units.js -- Role-based unit system with persistent names and rank badges.
// GR roles: Researcher, Engineer, Analyst, Principal, Intern, Barista, Security.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palette & Constants
// ---------------------------------------------------------------------------

const PALETTE = {
  unitBody:    0xDCC0A0,
  unitHead:    0xF0E4D8,
};

// ---------------------------------------------------------------------------
// Geometry & Material Caches
// ---------------------------------------------------------------------------
// Shared geometry: safe because geometry is never modified after creation.
// Shared accessory materials: safe because they are never modified at runtime.
// Body/head materials are NOT shared -- stateVisuals modifies them per-unit.

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

/** Role-specific accent colours (GR palette). */
const CLASS_COLORS = {
  Engineer:   0xE0A868,
  Researcher: 0x88C8E8,
  Intern:     0x90D098,
  Analyst:    0xF0C880,
  Principal:  0xB898E0,
  Security:   0xA8A0A8,
  Barista:    0xC89870,
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

/** Barista accessory set (coffee-themed). */
const BARISTA_ACCESSORIES = ['coffeeCup', 'milkJug', 'beanGrinder', 'portafilter', 'latteArtPlate'];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Determines a unit's role from session data.
 * Priority: Security > Intern > Engineer > Analyst > Principal > Researcher > Barista.
 * @param {{ state: string, has_children: boolean, age_seconds: number }} session
 * @returns {string} Role name.
 */
export function classifyUnit(session) {
  const { state, has_children, age_seconds } = session;

  if (state === 'stale')                                      return 'Security';
  if (age_seconds < 120)                                      return 'Intern';
  if (state === 'active' && has_children)                     return 'Engineer';
  if (state === 'awaiting')                                   return 'Analyst';
  if (age_seconds > 3600 && state === 'active')               return 'Principal';
  if (state === 'active')                                     return 'Researcher';
  return 'Barista';
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
// Rank Badges (GR Growth Framework)
// ---------------------------------------------------------------------------

/**
 * Returns a rank tier string based on session age, or null for base title.
 * @param {number} ageSeconds
 * @returns {string|null}
 */
export function rankFromAge(ageSeconds) {
  if (ageSeconds < 300)  return null;       // Base title -- no badge
  if (ageSeconds < 1800) return 'bronze';   // Senior / Bronze
  if (ageSeconds < 7200) return 'silver';   // Principal / Silver
  return 'gold';                            // Distinguished / Gold
}

/**
 * Returns a role-aware rank display title.
 * @param {string|null} rank -- 'bronze', 'silver', 'gold', or null
 * @param {string} unitClass -- the GR role name
 * @returns {string}
 */
export function rankDisplayTitle(rank, unitClass) {
  switch (unitClass) {
    case 'Engineer':
      switch (rank) {
        case 'bronze': return 'Senior Engineer';
        case 'silver': return 'Principal Engineer';
        case 'gold':   return 'Distinguished Engineer';
        default:       return 'Engineer';
      }
    case 'Analyst':
      switch (rank) {
        case 'bronze':
        case 'silver':
        case 'gold':   return 'Senior Analyst';
        default:       return 'Analyst';
      }
    default:
      if (!rank) return unitClass;
      return `Senior ${unitClass}`;
  }
}

/** Creates a small sphere pip above the head for the given rank. */
function buildRankBadge(rank) {
  const colorMap  = { bronze: 0xD4A880, silver: 0xC8C4C8, gold: 0xE8D0A8 };
  const matOpts   = { color: colorMap[rank] };

  if (rank === 'gold') {
    matOpts.emissive          = 0xE8D0A8;
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
  const accent    = CLASS_COLORS[unitClass] ?? CLASS_COLORS.Barista;

  // --- Body dimensions per role ---
  const bodyDims = classDimensions(unitClass);
  const bodyGeom = cachedGeom(`body-${unitClass}`, () =>
    new THREE.CylinderGeometry(bodyDims.radiusTop, bodyDims.radiusBottom, bodyDims.height, 12));
  const bodyMat = new THREE.MeshLambertMaterial({
    color:       PALETTE.unitBody,
    transparent: unitClass === 'Security',
    opacity:     unitClass === 'Security' ? 0.3 : 1.0,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y  = bodyDims.height / 2 + 0.05;
  body.castShadow  = true;
  body.name         = 'body';
  group.add(body);

  // --- Head ---
  const headMat = new THREE.MeshLambertMaterial({
    color:       PALETTE.unitHead,
    transparent: unitClass === 'Security',
    opacity:     unitClass === 'Security' ? 0.3 : 1.0,
  });
  const headGeom = cachedGeom('head', () => new THREE.SphereGeometry(0.12, 16, 12));
  const head = new THREE.Mesh(headGeom, headMat);
  head.position.y  = bodyDims.height + 0.17;
  head.castShadow  = true;
  head.name         = 'head';
  group.add(head);

  // Scale down Interns.
  if (unitClass === 'Intern') group.scale.setScalar(0.8);

  // --- Role-specific accessory ---
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

  // --- Player banner (multi-person mode) ---
  if (session.ownerColor) {
    const banner = buildPlayerBanner(session.ownerColor);
    if (banner) group.add(banner);
  }

  // --- User data ---
  group.userData = {
    type:       'unit',
    sessionId:  session.id,
    unitClass,
    unitName,
    rank,
    owner:      session.owner || null,
    ownerColor: session.ownerColor || null,
    baseY: 0,
    baseX: 0,
    baseZ: 0,
  };

  return group;
}

// ---------------------------------------------------------------------------
// Body Dimensions
// ---------------------------------------------------------------------------

/** Returns cylinder parameters per role. */
function classDimensions(unitClass) {
  switch (unitClass) {
    case 'Engineer':   return { radiusTop: 0.18, radiusBottom: 0.21, height: 0.4  };
    case 'Researcher': return { radiusTop: 0.13, radiusBottom: 0.15, height: 0.45 };
    default:           return { radiusTop: 0.15, radiusBottom: 0.18, height: 0.4  };
  }
}

// ---------------------------------------------------------------------------
// Role Accessories
// ---------------------------------------------------------------------------

/** Dispatches to the correct accessory builder for a role. */
function buildClassAccessory(unitClass, accent, session) {
  switch (unitClass) {
    case 'Engineer':   return buildWrench(accent);
    case 'Researcher': return buildFloatingChart(accent);
    case 'Intern':     return buildLantern(accent);
    case 'Analyst':    return buildClipboard(accent);
    case 'Principal':  return buildCape(accent);
    case 'Barista':    return buildBaristaAccessory(session);
    case 'Security':   return buildKeycard(accent);
    default:           return null;
  }
}

/** Engineer -- wrench/spanner (replaces hammer). */
function buildWrench(color) {
  const g = new THREE.Group();
  // Wrench head -- open-ended shape approximated by a flat box with a notch
  const head = new THREE.Mesh(
    cachedGeom('wrench-head', () => new THREE.BoxGeometry(0.07, 0.03, 0.05)),
    cachedMat(`wrench-accent-${color}`, () => new THREE.MeshLambertMaterial({ color })),
  );
  head.position.set(0.22, 0.48, 0);
  head.castShadow = true;
  g.add(head);

  const handle = new THREE.Mesh(
    cachedGeom('wrench-handle', () => new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6)),
    cachedMat('metal-handle', () => new THREE.MeshLambertMaterial({ color: 0x8A8A8A })),
  );
  handle.position.set(0.22, 0.38, 0);
  handle.castShadow = true;
  g.add(handle);
  return g;
}

/** Researcher -- floating holographic chart above head (baby blue tint). */
function buildFloatingChart(color) {
  const g = new THREE.Group();
  // Chart panel
  const panel = new THREE.Mesh(
    cachedGeom('chart-panel', () => new THREE.BoxGeometry(0.1, 0.07, 0.005)),
    cachedMat(`chart-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 })),
  );
  panel.position.set(0, 0.78, 0);
  panel.rotation.y = 0.25;
  panel.castShadow = true;
  g.add(panel);

  // Small bar-chart lines on the panel
  const barColor = 0xFFFFFF;
  for (let i = 0; i < 3; i++) {
    const barH = 0.015 + i * 0.008;
    const bar = new THREE.Mesh(
      cachedGeom(`chart-bar-${i}`, () => new THREE.BoxGeometry(0.015, barH, 0.003)),
      cachedMat('chart-bar-white', () => new THREE.MeshLambertMaterial({ color: barColor })),
    );
    bar.position.set(-0.025 + i * 0.025, 0.78 - 0.035 + barH / 2, 0.004);
    bar.rotation.y = 0.25;
    g.add(bar);
  }
  return g;
}

/** Intern -- lantern (finding their way). Stays from Scout. */
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

  // Visitor badge -- small flat rectangle on chest
  const badge = new THREE.Mesh(
    cachedGeom('visitor-badge', () => new THREE.BoxGeometry(0.04, 0.03, 0.005)),
    cachedMat('visitor-badge', () => new THREE.MeshLambertMaterial({ color: 0xFFFFFF })),
  );
  badge.position.set(0.1, 0.3, 0.15);
  g.add(badge);

  return g;
}

/** Analyst -- clipboard/tablet shield (gold glow). */
function buildClipboard(color) {
  const g = new THREE.Group();
  // Clipboard board
  const board = new THREE.Mesh(
    cachedGeom('clipboard-board', () => new THREE.BoxGeometry(0.1, 0.14, 0.015)),
    cachedMat(`clipboard-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 })),
  );
  board.position.set(-0.2, 0.3, 0);
  board.castShadow = true;
  g.add(board);

  // Clipboard clip at top
  const clip = new THREE.Mesh(
    cachedGeom('clipboard-clip', () => new THREE.BoxGeometry(0.04, 0.02, 0.02)),
    cachedMat('clipboard-clip-metal', () => new THREE.MeshLambertMaterial({ color: 0xC0C0C0 })),
  );
  clip.position.set(-0.2, 0.38, 0);
  g.add(clip);

  return g;
}

/** Principal -- distinguished cape with lapel pin. */
function buildCape(color) {
  const g = new THREE.Group();
  const cape = new THREE.Mesh(
    cachedGeom('cape', () => new THREE.PlaneGeometry(0.22, 0.3)),
    cachedMat(`cape-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })),
  );
  cape.position.set(0, 0.3, -0.15);
  cape.castShadow = true;
  g.add(cape);

  // Lapel pin -- small gold sphere
  const pin = new THREE.Mesh(
    cachedGeom('lapel-pin', () => new THREE.SphereGeometry(0.015, 6, 6)),
    cachedMat('lapel-pin-gold', () =>
      new THREE.MeshLambertMaterial({ color: 0xE8D0A8, emissive: 0xE8D0A8, emissiveIntensity: 0.3 })),
  );
  pin.position.set(0.12, 0.4, 0.12);
  g.add(pin);

  return g;
}

/** Security -- translucent keycard silhouette. */
function buildKeycard(color) {
  const card = new THREE.Mesh(
    cachedGeom('keycard', () => new THREE.BoxGeometry(0.06, 0.08, 0.005)),
    cachedMat(`keycard-${color}`, () =>
      new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.4 })),
  );
  card.position.set(0.18, 0.25, 0.1);
  card.rotation.z = 0.15;
  card.castShadow = true;
  return card;
}

// ---------------------------------------------------------------------------
// Barista Accessories (coffee-themed, replaces Peasant legacy items)
// ---------------------------------------------------------------------------

/** Barista fallback -- picks a deterministic coffee accessory based on session ID. */
function buildBaristaAccessory(session) {
  const idx = hashStringToIndex(session?.id || '', BARISTA_ACCESSORIES.length);
  const type = BARISTA_ACCESSORIES[idx];
  return buildBaristaItem(type);
}

function buildBaristaItem(type) {
  switch (type) {
    case 'coffeeCup':     return buildCoffeeCup();
    case 'milkJug':       return buildMilkJug();
    case 'beanGrinder':   return buildBeanGrinder();
    case 'portafilter':   return buildPortafilter();
    case 'latteArtPlate': return buildLatteArtPlate();
    default:              return null;
  }
}

/** Coffee Cup -- small cylinder with steam wisps. */
function buildCoffeeCup() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(
    cachedGeom('coffee-cup', () => new THREE.CylinderGeometry(0.03, 0.025, 0.05, 8)),
    cachedMat('coffee-cup', () => new THREE.MeshLambertMaterial({ color: 0xF5F5F0 })),
  );
  cup.position.set(0.2, 0.22, 0);
  cup.castShadow = true;
  g.add(cup);
  // Coffee inside
  const coffee = new THREE.Mesh(
    cachedGeom('coffee-liquid', () => new THREE.CylinderGeometry(0.025, 0.025, 0.008, 8)),
    cachedMat('coffee-liquid', () => new THREE.MeshLambertMaterial({ color: 0x3B2313 })),
  );
  coffee.position.set(0.2, 0.248, 0);
  g.add(coffee);
  // Steam wisp
  const steam = new THREE.Mesh(
    cachedGeom('steam-wisp', () => new THREE.SphereGeometry(0.01, 4, 4)),
    cachedMat('steam', () => new THREE.MeshLambertMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.3 })),
  );
  steam.position.set(0.2, 0.28, 0);
  g.add(steam);
  return g;
}

/** Milk Jug -- small cone pitcher. */
function buildMilkJug() {
  const g = new THREE.Group();
  const jug = new THREE.Mesh(
    cachedGeom('milk-jug', () => new THREE.ConeGeometry(0.03, 0.06, 8)),
    cachedMat('milk-jug', () => new THREE.MeshLambertMaterial({ color: 0xC0C0C0 })),
  );
  jug.position.set(0.2, 0.23, 0);
  jug.rotation.x = Math.PI;
  jug.castShadow = true;
  g.add(jug);
  // Spout
  const spout = new THREE.Mesh(
    cachedGeom('jug-spout', () => new THREE.BoxGeometry(0.015, 0.01, 0.02)),
    cachedMat('milk-jug', () => new THREE.MeshLambertMaterial({ color: 0xC0C0C0 })),
  );
  spout.position.set(0.2, 0.265, 0.025);
  g.add(spout);
  return g;
}

/** Bean Grinder -- small box with handle. */
function buildBeanGrinder() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    cachedGeom('grinder-body', () => new THREE.BoxGeometry(0.05, 0.05, 0.05)),
    cachedMat('grinder-body', () => new THREE.MeshLambertMaterial({ color: 0x6B5A3E })),
  );
  body.position.set(0.2, 0.22, 0);
  body.castShadow = true;
  g.add(body);
  // Crank handle
  const handle = new THREE.Mesh(
    cachedGeom('grinder-handle', () => new THREE.CylinderGeometry(0.005, 0.005, 0.04, 4)),
    cachedMat('metal-handle', () => new THREE.MeshLambertMaterial({ color: 0x8A8A8A })),
  );
  handle.position.set(0.2, 0.27, 0);
  handle.rotation.z = Math.PI / 4;
  g.add(handle);
  return g;
}

/** Espresso Portafilter -- flat disc with handle. */
function buildPortafilter() {
  const g = new THREE.Group();
  const basket = new THREE.Mesh(
    cachedGeom('portafilter-basket', () => new THREE.CylinderGeometry(0.03, 0.03, 0.015, 8)),
    cachedMat('portafilter-metal', () => new THREE.MeshLambertMaterial({ color: 0xA0A0A0 })),
  );
  basket.position.set(0.2, 0.22, 0);
  basket.castShadow = true;
  g.add(basket);
  const handle = new THREE.Mesh(
    cachedGeom('portafilter-handle', () => new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6)),
    cachedMat('portafilter-handle', () => new THREE.MeshLambertMaterial({ color: 0x2A2A2A })),
  );
  handle.position.set(0.2, 0.22, 0.05);
  handle.rotation.x = Math.PI / 2;
  g.add(handle);
  return g;
}

/** Latte Art Plate -- flat disc with swirl on top. */
function buildLatteArtPlate() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    cachedGeom('latte-plate', () => new THREE.CylinderGeometry(0.04, 0.04, 0.008, 8)),
    cachedMat('latte-plate', () => new THREE.MeshLambertMaterial({ color: 0xF5F5F0 })),
  );
  plate.position.set(0.2, 0.20, 0);
  plate.castShadow = true;
  g.add(plate);
  // Swirl (tiny torus on top)
  const swirl = new THREE.Mesh(
    cachedGeom('latte-swirl', () => new THREE.TorusGeometry(0.015, 0.004, 4, 8)),
    cachedMat('latte-swirl', () => new THREE.MeshLambertMaterial({ color: 0x3B2313 })),
  );
  swirl.position.set(0.2, 0.21, 0);
  swirl.rotation.x = Math.PI / 2;
  g.add(swirl);
  return g;
}

// ---------------------------------------------------------------------------
// Player Banner (multi-person mode)
// ---------------------------------------------------------------------------

/**
 * Creates a small colored flag banner above the unit to indicate player ownership.
 * Pole is cached; flag material is per-unit (varies by color).
 * @param {string} colorStr -- CSS hex color like '#FF6B6B'
 * @returns {THREE.Group}
 */
function buildPlayerBanner(colorStr) {
  const g = new THREE.Group();
  g.name = 'playerBanner';

  // Pole
  const pole = new THREE.Mesh(
    cachedGeom('banner-pole', () => new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4)),
    cachedMat('banner-pole-brown', () => new THREE.MeshLambertMaterial({ color: 0x6B5A3E })),
  );
  pole.position.set(-0.12, 0.72, -0.08);
  g.add(pole);

  // Flag -- per-unit material (color varies per player)
  const colorNum = parseInt(colorStr.replace('#', ''), 16) || 0xA8D0E0;
  const flag = new THREE.Mesh(
    cachedGeom('banner-flag', () => new THREE.PlaneGeometry(0.12, 0.08)),
    new THREE.MeshLambertMaterial({ color: colorNum, side: THREE.DoubleSide }),
  );
  flag.position.set(-0.06, 0.82, -0.08);
  g.add(flag);

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
