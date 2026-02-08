// lanterns.js -- Decorative lanterns that light up at dusk and turn off at dawn.
// Creates 12 lamppost meshes with PointLights distributed between buildings.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Position selection -- pick 12 well-spaced midpoints between buildings
// ---------------------------------------------------------------------------

/**
 * Choose up to `count` lantern positions from building midpoints,
 * greedily filtered for minimum spacing.
 * @param {{ x: number, z: number }[]} buildingPositions
 * @param {number} count
 * @returns {{ x: number, z: number }[]}
 */
export function chooseLanternPositions(buildingPositions, count = 12) {
  // Generate candidate midpoints from all unique building pairs
  const candidates = [];
  for (let i = 0; i < buildingPositions.length; i++) {
    for (let j = i + 1; j < buildingPositions.length; j++) {
      const a = buildingPositions[i];
      const b = buildingPositions[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      candidates.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        dist,
      });
    }
  }

  // Sort by distance (prefer midpoints of closer buildings -- these are "paths")
  candidates.sort((a, b) => a.dist - b.dist);

  const MIN_SPACING = 2;
  const chosen = [];

  for (const c of candidates) {
    if (chosen.length >= count) break;
    let tooClose = false;
    for (const p of chosen) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz < MIN_SPACING * MIN_SPACING) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      chosen.push({ x: c.x, z: c.z });
    }
  }

  // Fill remaining with jittered interpolations toward the map center
  if (chosen.length < count && buildingPositions.length > 0) {
    for (const bp of buildingPositions) {
      if (chosen.length >= count) break;
      const jx = bp.x * 0.5 + (Math.random() - 0.5) * 1.5;
      const jz = bp.z * 0.5 + (Math.random() - 0.5) * 1.5;
      let tooClose = false;
      for (const p of chosen) {
        const dx = p.x - jx;
        const dz = p.z - jz;
        if (dx * dx + dz * dz < MIN_SPACING * MIN_SPACING) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        chosen.push({ x: jx, z: jz });
      }
    }
  }

  return chosen;
}

// ---------------------------------------------------------------------------
// Lantern mesh builder
// ---------------------------------------------------------------------------

const POST_COLOR = 0xA89890;
const GLOBE_COLOR = 0xE8C8A0;

/**
 * Build a single lamppost mesh group: thin post + emissive globe + PointLight.
 * @returns {{ group: THREE.Group, light: THREE.PointLight, globe: THREE.Mesh }}
 */
function buildLanternMesh() {
  const group = new THREE.Group();

  // Post
  const postGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: POST_COLOR });
  const post = new THREE.Mesh(postGeom, postMat);
  post.position.y = 0.25;
  post.castShadow = false;
  post.receiveShadow = false;
  group.add(post);

  // Globe
  const globeGeom = new THREE.SphereGeometry(0.06, 8, 6);
  const globeMat = new THREE.MeshLambertMaterial({
    color: GLOBE_COLOR,
    emissive: GLOBE_COLOR,
    emissiveIntensity: 0,
  });
  const globe = new THREE.Mesh(globeGeom, globeMat);
  globe.position.y = 0.53;
  globe.castShadow = false;
  globe.receiveShadow = false;
  group.add(globe);

  // PointLight (starts off)
  const light = new THREE.PointLight(GLOBE_COLOR, 0, 2.5);
  light.castShadow = false;
  light.position.y = 0.53;
  group.add(light);

  return { group, light, globe };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create 12 decorative lanterns distributed between buildings.
 * @param {THREE.Scene} scene
 * @param {{ x: number, z: number }[]} buildingPositions
 * @param {{ getHeightAt?: (x: number, z: number) => number }} terrain
 * @returns {{ group: THREE.Group, light: THREE.PointLight, globe: THREE.Mesh }[]}
 */
export function createLanterns(scene, buildingPositions, terrain) {
  const positions = chooseLanternPositions(buildingPositions);
  const lanterns = [];

  for (const pos of positions) {
    const { group, light, globe } = buildLanternMesh();
    const groundY = terrain.getHeightAt
      ? terrain.getHeightAt(pos.x, pos.z)
      : 0.15;
    group.position.set(pos.x, groundY, pos.z);
    scene.add(group);
    lanterns.push({ group, light, globe });
  }

  return lanterns;
}

/**
 * Update lantern intensity based on the current day/night phase.
 * @param {{ group: THREE.Group, light: THREE.PointLight, globe: THREE.Mesh }[]} lanterns
 * @param {string} phase - 'day' | 'dusk' | 'night' | 'dawn'
 * @param {number} phaseProgress - 0..1 progress within the phase
 */
export function updateLanterns(lanterns, phase, phaseProgress) {
  let intensity;
  switch (phase) {
    case 'day':
      intensity = 0;
      break;
    case 'dusk':
      intensity = phaseProgress * 0.6;
      break;
    case 'night':
      intensity = 0.6;
      break;
    case 'dawn':
      intensity = (1 - phaseProgress) * 0.6;
      break;
    default:
      intensity = 0;
  }

  for (const lantern of lanterns) {
    lantern.light.intensity = intensity;
    lantern.globe.material.emissiveIntensity = intensity;
  }
}
