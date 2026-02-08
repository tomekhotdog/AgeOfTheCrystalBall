// particles.js — Particle effects module for the Age of the Crystal Ball.
// Uses THREE.Points for burst/trail effects and THREE.Mesh (RingGeometry)
// for sentinel rings. All spawn methods return nothing; the system manages
// lifecycles internally. Call update(time, delta) every frame.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ACTIVE_GROUPS = 20;

// Shared vertex colors texture — a simple 4x4 radial gradient used by all
// point materials so that particles look like soft circles, not squares.
const _canvas = document.createElement('canvas');
_canvas.width = 32;
_canvas.height = 32;
const _ctx = _canvas.getContext('2d');
const _grad = _ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
_grad.addColorStop(0, 'rgba(255,255,255,1)');
_grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
_grad.addColorStop(1, 'rgba(255,255,255,0)');
_ctx.fillStyle = _grad;
_ctx.fillRect(0, 0, 32, 32);
const PARTICLE_TEXTURE = new THREE.CanvasTexture(_canvas);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a random float in [min, max). */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** Returns a random integer in [min, max] (inclusive). */
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

/**
 * Creates a PointsMaterial configured for particles.
 *
 * @param {number} color    — hex colour
 * @param {number} size     — base point size (before attenuation)
 * @param {number} opacity  — starting opacity (0–1)
 * @returns {THREE.PointsMaterial}
 */
function makePointsMaterial(color, size, opacity = 1.0) {
  return new THREE.PointsMaterial({
    color,
    size,
    map: PARTICLE_TEXTURE,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    opacity,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Builds a BufferGeometry with `count` particles all placed at `origin`.
 *
 * @param {THREE.Vector3} origin
 * @param {number} count
 * @returns {{ geometry: THREE.BufferGeometry, posAttr: THREE.Float32BufferAttribute }}
 */
function makeParticleGeometry(origin, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = origin.x;
    positions[i * 3 + 1] = origin.y;
    positions[i * 3 + 2] = origin.z;
  }
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.Float32BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  return { geometry, posAttr };
}

// ---------------------------------------------------------------------------
// ParticleSystem
// ---------------------------------------------------------------------------

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene — the scene particles are added to
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this._scene = scene;

    /**
     * Active one-shot particle groups.
     * @type {Array<{
     *   points: THREE.Points,
     *   velocities: Float32Array,
     *   ages: Float32Array,
     *   maxAge: number,
     *   gravity: number,
     *   fadeOut: boolean,
     *   startOpacity: number,
     *   material: THREE.PointsMaterial,
     * }>}
     */
    this._groups = [];

    /**
     * Persistent sentinel rings (loop until explicitly removed).
     * @type {Array<{
     *   mesh: THREE.Mesh,
     *   basePosition: THREE.Vector3,
     *   elapsed: number,
     *   period: number,
     * }>}
     */
    this._rings = [];
  }

  // -----------------------------------------------------------------------
  // 1. Builder sparks — 8-12 orange particles bursting upward
  // -----------------------------------------------------------------------

  /**
   * Burst of orange sparks (e.g. builder hammering).
   * @param {THREE.Vector3} position
   */
  spawnBuilderSparks(position) {
    const count = randInt(8, 12);
    const { geometry, posAttr } = makeParticleGeometry(position, count);
    const material = makePointsMaterial(0xE0B898, rand(3, 5));

    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      velocities[i * 3 + 0] = rand(-0.3, 0.3);  // x spread
      velocities[i * 3 + 1] = rand(0.8, 1.6);    // upward burst
      velocities[i * 3 + 2] = rand(-0.3, 0.3);  // z spread
    }

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this._scene.add(points);

    this._addGroup({
      points,
      velocities,
      ages: new Float32Array(count),
      maxAge: 1.0,
      gravity: -1.2,
      fadeOut: false,
      startOpacity: 1.0,
      material,
    });
  }

  // -----------------------------------------------------------------------
  // 2. Scholar pages — 3-5 white particles floating upward slowly
  // -----------------------------------------------------------------------

  /**
   * Slow-rising page scraps (e.g. scholar reading/researching).
   * @param {THREE.Vector3} position
   */
  spawnScholarPages(position) {
    const count = randInt(3, 5);
    const { geometry, posAttr } = makeParticleGeometry(position, count);
    const material = makePointsMaterial(0xF5F0E8, rand(4, 6));

    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      velocities[i * 3 + 0] = rand(-0.08, 0.08); // gentle x drift
      velocities[i * 3 + 1] = rand(0.15, 0.35);   // slow upward
      velocities[i * 3 + 2] = rand(-0.08, 0.08); // gentle z drift
    }

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this._scene.add(points);

    this._addGroup({
      points,
      velocities,
      ages: new Float32Array(count),
      maxAge: 3.0,
      gravity: 0,
      fadeOut: false,
      startOpacity: 1.0,
      material,
    });
  }

  // -----------------------------------------------------------------------
  // 3. Sentinel ring — expanding gold ring on the ground plane (looping)
  // -----------------------------------------------------------------------

  /**
   * Creates a persistent sentinel ring that loops its expand/fade animation.
   * The caller is responsible for calling `removeRing(ring)` when done.
   *
   * @param {THREE.Vector3} position
   * @returns {object} ring handle — pass to removeRing() to clean up
   */
  createSentinelRing(position) {
    const geometry = new THREE.RingGeometry(0.75, 0.8, 48);
    // Rotate so it lies flat on the XZ ground plane
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: 0xE0D0A8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.y = 0.02; // just above ground to avoid z-fighting
    mesh.scale.set(0, 0, 0); // start invisible
    this._scene.add(mesh);

    const ring = {
      mesh,
      basePosition: position.clone(),
      elapsed: 0,
      period: 2.0, // seconds for one full expand cycle
    };

    this._rings.push(ring);
    return ring;
  }

  /**
   * Removes a sentinel ring from the scene and disposes its resources.
   * @param {object} ring — the handle returned by createSentinelRing()
   */
  removeRing(ring) {
    const idx = this._rings.indexOf(ring);
    if (idx !== -1) this._rings.splice(idx, 1);

    this._scene.remove(ring.mesh);
    ring.mesh.geometry.dispose();
    ring.mesh.material.dispose();
  }

  // -----------------------------------------------------------------------
  // 4. Ghost wisps — 4-6 grey semi-transparent trailing particles
  // -----------------------------------------------------------------------

  /**
   * Semi-transparent grey wisps that fade out (e.g. ghost/stale unit trail).
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} [direction] — optional last movement direction
   */
  spawnGhostWisps(position, direction) {
    const count = randInt(4, 6);
    const { geometry, posAttr } = makeParticleGeometry(position, count);
    const material = makePointsMaterial(0xB0A8B0, rand(3, 4), 0.6);

    // If a direction is given, bias velocities along it; otherwise random drift
    const dx = direction ? direction.x * 0.2 : 0;
    const dz = direction ? direction.z * 0.2 : 0;

    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      velocities[i * 3 + 0] = dx + rand(-0.05, 0.05);
      velocities[i * 3 + 1] = rand(0.02, 0.08);
      velocities[i * 3 + 2] = dz + rand(-0.05, 0.05);
    }

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this._scene.add(points);

    this._addGroup({
      points,
      velocities,
      ages: new Float32Array(count),
      maxAge: 2.0,
      gravity: 0,
      fadeOut: true,
      startOpacity: 0.6,
      material,
    });
  }

  // -----------------------------------------------------------------------
  // 5. Dust burst — 10-15 brown particles at ground level
  // -----------------------------------------------------------------------

  /**
   * Quick dust puff on the ground (e.g. unit stops moving).
   * @param {THREE.Vector3} position
   */
  spawnDust(position) {
    const count = randInt(10, 15);
    // Place at ground level
    const groundPos = new THREE.Vector3(position.x, 0.05, position.z);
    const { geometry, posAttr } = makeParticleGeometry(groundPos, count);
    const material = makePointsMaterial(0xC8B8A0, rand(2, 4), 0.7);

    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Outward burst in the xz plane
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(0.5, 1.2);
      velocities[i * 3 + 0] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = rand(0.1, 0.4); // slight upward
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this._scene.add(points);

    this._addGroup({
      points,
      velocities,
      ages: new Float32Array(count),
      maxAge: 0.5,
      gravity: -0.5,
      fadeOut: true,
      startOpacity: 0.7,
      material,
    });
  }

  // -----------------------------------------------------------------------
  // 6. Death motes — 8-10 white/gold particles scattering upward
  // -----------------------------------------------------------------------

  /**
   * Upward scatter of luminous motes (e.g. unit death / despawn).
   * @param {THREE.Vector3} position
   */
  spawnDeathMotes(position) {
    const count = randInt(8, 10);
    const { geometry, posAttr } = makeParticleGeometry(position, count);
    const material = makePointsMaterial(0xF0E0C8, rand(3, 5));

    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      velocities[i * 3 + 0] = rand(-0.4, 0.4);
      velocities[i * 3 + 1] = rand(0.6, 1.4);  // upward scatter
      velocities[i * 3 + 2] = rand(-0.4, 0.4);
    }

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this._scene.add(points);

    this._addGroup({
      points,
      velocities,
      ages: new Float32Array(count),
      maxAge: 1.5,
      gravity: -0.3,
      fadeOut: true,
      startOpacity: 1.0,
      material,
    });
  }

  // -----------------------------------------------------------------------
  // Update loop — call once per frame
  // -----------------------------------------------------------------------

  /**
   * Advances all particle groups and sentinel rings.
   *
   * @param {number} time  — elapsed time in seconds (from clock.getElapsedTime)
   * @param {number} delta — frame delta in seconds (from clock.getDelta)
   */
  update(time, delta) {
    this._updateGroups(delta);
    this._updateRings(delta);
  }

  // -----------------------------------------------------------------------
  // Internal: one-shot particle groups
  // -----------------------------------------------------------------------

  /**
   * Registers a new particle group, enforcing the MAX_ACTIVE_GROUPS cap.
   * @param {object} group
   */
  _addGroup(group) {
    // Enforce cap — remove the oldest group if we're at the limit
    while (this._groups.length >= MAX_ACTIVE_GROUPS) {
      this._disposeGroup(this._groups[0]);
      this._groups.shift();
    }
    this._groups.push(group);
  }

  /**
   * Per-frame update for all one-shot particle groups.
   * @param {number} delta
   */
  _updateGroups(delta) {
    for (let g = this._groups.length - 1; g >= 0; g--) {
      const group = this._groups[g];
      const posAttr = group.points.geometry.getAttribute('position');
      const count = group.ages.length;
      let allExpired = true;

      for (let i = 0; i < count; i++) {
        group.ages[i] += delta;

        if (group.ages[i] >= group.maxAge) {
          continue; // particle has expired — leave it where it is
        }

        allExpired = false;

        const i3 = i * 3;

        // Apply gravity to vertical velocity
        if (group.gravity !== 0) {
          group.velocities[i3 + 1] += group.gravity * delta;
        }

        // Integrate position
        posAttr.array[i3 + 0] += group.velocities[i3 + 0] * delta;
        posAttr.array[i3 + 1] += group.velocities[i3 + 1] * delta;
        posAttr.array[i3 + 2] += group.velocities[i3 + 2] * delta;
      }

      posAttr.needsUpdate = true;

      // Fade out the entire group based on the average progress toward maxAge
      if (group.fadeOut) {
        // Use the youngest particle's age ratio so the group fades smoothly
        let minAge = group.maxAge;
        for (let i = 0; i < count; i++) {
          if (group.ages[i] < minAge) minAge = group.ages[i];
        }
        const t = Math.min(minAge / group.maxAge, 1.0);
        group.material.opacity = group.startOpacity * (1.0 - t);
      }

      // Remove fully expired groups
      if (allExpired) {
        this._disposeGroup(group);
        this._groups.splice(g, 1);
      }
    }
  }

  /**
   * Cleans up a particle group's GPU resources.
   * @param {object} group
   */
  _disposeGroup(group) {
    this._scene.remove(group.points);
    group.points.geometry.dispose();
    group.material.dispose();
  }

  // -----------------------------------------------------------------------
  // Internal: sentinel rings (looping)
  // -----------------------------------------------------------------------

  /**
   * Per-frame update for sentinel rings. Each ring expands from scale 0 to 1
   * over its period, then resets — looping continuously.
   * @param {number} delta
   */
  _updateRings(delta) {
    for (const ring of this._rings) {
      ring.elapsed += delta;

      // Normalised progress within one cycle [0, 1)
      const t = (ring.elapsed % ring.period) / ring.period;

      // Scale from 0 to 1
      const scale = t;
      ring.mesh.scale.set(scale, scale, scale);

      // Fade out as the ring expands
      ring.mesh.material.opacity = 0.8 * (1.0 - t);
    }
  }
}
