// worldManager.js — Core orchestrator that manages the entire game world:
// buildings (one per group), units (one per session), anchoring, and animation.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createBuilding, BUILDING_TYPES } from './buildings.js';
import { createUnit, classifyUnit, _geomCache, _accessoryMatCache } from './units.js';
import { getActivityForGroup } from './activities.js';
import { applyStateVisuals, updateChildIndicator } from './stateVisuals.js';
import { animBob, lerpToTarget } from './animations.js';

export class WorldManager {
  /**
   * @param {THREE.Scene} scene
   * @param {{ tiles: Map, getAvailableGrassTile: () => ({x:number,z:number}|null), markTileUsed: (x:number,z:number) => void }} terrain
   * @param {import('./particles.js').ParticleSystem} [particles]
   * @param {import('./healthbars.js').HealthBarManager} [healthBars]
   * @param {import('./marchIn.js').MarchInManager} [marchInManager]
   */
  constructor(scene, terrain, particles, healthBars, marchInManager) {
    this.scene = scene;
    this.terrain = terrain;
    this.particles = particles ?? null;
    this.healthBars = healthBars ?? null;
    this.marchInManager = marchInManager ?? null;

    /** Maps marchInManager internal IDs to session IDs for completion tracking */
    this._marchToSession = new Map();

    /** groupId -> { mesh, type, position, anchors, activityPair, label, healthBar } */
    this.buildings = new Map();

    /** sessionId -> { mesh, state, groupId, anchorIndex, targetPos, sentinelRing, lastParticleTime } */
    this.units = new Map();

    /** Cycles through BUILDING_TYPES so each group gets a different look. */
    this.buildingTypeIndex = 0;
  }

  // ---------------------------------------------------------------------------
  // update — called every poll cycle with the /api/sessions response
  // ---------------------------------------------------------------------------

  /**
   * Reconcile world state with the latest API data.
   * @param {{ timestamp: string, sessions: object[], groups: object[] }} apiData
   */
  update(apiData) {
    const currentGroupIds = new Set(apiData.groups.map(g => g.id));
    const currentSessionIds = new Set(apiData.sessions.map(s => s.id));

    // ── 1. Spawn new buildings for new groups ──────────────────────────────
    let groupIndex = 0;
    for (const group of apiData.groups) {
      if (!this.buildings.has(group.id)) {
        this.spawnBuilding(group, groupIndex);
      }
      groupIndex++;
    }

    // ── 2. Mark abandoned buildings (group disappeared) ────────────────────
    for (const [groupId, bldg] of this.buildings) {
      if (!currentGroupIds.has(groupId)) {
        // Dim the building to show it is abandoned
        bldg.mesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 0.35;
          }
        });
        bldg.abandoned = true;
      } else {
        // Restore if it was previously abandoned but the group came back
        if (bldg.abandoned) {
          bldg.mesh.traverse(child => {
            if (child.isMesh && child.material) {
              child.material.opacity = 1.0;
            }
          });
          bldg.abandoned = false;
        }
      }
    }

    // ── 3. Spawn new units for new sessions ────────────────────────────────
    for (const session of apiData.sessions) {
      if (!this.units.has(session.id)) {
        this.spawnUnit(session);
      }
    }

    // ── 4. Remove units whose sessions disappeared ─────────────────────────
    const toRemove = [];
    for (const [sessionId] of this.units) {
      if (!currentSessionIds.has(sessionId)) toRemove.push(sessionId);
    }
    for (const sessionId of toRemove) {
      this.removeUnit(sessionId);
    }

    // ── 5. Update existing units whose state may have changed ──────────────
    for (const session of apiData.sessions) {
      const unit = this.units.get(session.id);
      if (!unit) continue;

      if (unit.state !== session.state) {
        unit.state = session.state;
      }
      // Keep fresh copies of live session data on the unit record
      unit.session = session;
    }

    // ── 6. Update health bars for each building ──────────────────────────
    if (this.healthBars) {
      // Precompute sessions grouped by group ID (O(n) instead of O(m*n))
      const sessionsByGroup = new Map();
      for (const session of apiData.sessions) {
        let arr = sessionsByGroup.get(session.group);
        if (!arr) { arr = []; sessionsByGroup.set(session.group, arr); }
        arr.push(session);
      }
      for (const [groupId, bldg] of this.buildings) {
        if (!bldg.healthBar) continue;
        const groupSessions = sessionsByGroup.get(groupId) || [];
        this.healthBars.updateHealthBar(bldg.healthBar, groupSessions);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // spawnBuilding
  // ---------------------------------------------------------------------------

  /**
   * Place a new building on the terrain for the given group.
   * @param {{ id: string, cwd: string, session_count: number }} group
   * @param {number} groupIndex
   */
  spawnBuilding(group, groupIndex) {
    const tile = this.terrain.getAvailableGrassTile();
    if (!tile) {
      console.warn('[WorldManager] No available grass tile for group', group.id);
      return;
    }
    this.terrain.markTileUsed(tile.x, tile.z);

    // Pick the next building type in round-robin fashion
    const typeIndex = this.buildingTypeIndex % BUILDING_TYPES.length;
    this.buildingTypeIndex++;
    const buildingType = BUILDING_TYPES[typeIndex];

    // Create 3D mesh
    const mesh = createBuilding(buildingType);
    mesh.position.set(tile.x, 0.15, tile.z); // sit on top of the grass tile
    mesh.userData.type = 'building';
    mesh.userData.groupId = group.id;
    this.scene.add(mesh);

    // Generate anchor positions around the building
    const anchors = this._generateAnchors(tile.x, tile.z);

    // Get the activity pair for this group (uses the sequential index, not the string id)
    const activityPair = getActivityForGroup(this.buildingTypeIndex - 1);

    // CSS2D label floating above the building
    const labelDiv = document.createElement('div');
    labelDiv.className = 'building-label';
    labelDiv.textContent = group.id;
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 2.2, 0);
    mesh.add(label);

    // Health bar floating above the building
    const healthBar = this.healthBars
      ? this.healthBars.createHealthBar(mesh)
      : null;

    this.buildings.set(group.id, {
      mesh,
      type: buildingType,
      position: { x: tile.x, z: tile.z },
      anchors,
      activityPair,
      label,
      healthBar,
      abandoned: false,
    });
  }

  // ---------------------------------------------------------------------------
  // spawnUnit
  // ---------------------------------------------------------------------------

  /**
   * Create a unit mesh for a session and anchor it near its group building.
   * @param {{ id: string, group: string, state: string, cpu: number, has_children: boolean }} session
   */
  spawnUnit(session) {
    const mesh = createUnit(session);
    mesh.userData.type = 'unit';
    mesh.userData.sessionId = session.id;

    const bldg = this.buildings.get(session.group);
    if (!bldg) {
      // Group building hasn't been created yet — defer (will be picked up next cycle)
      return;
    }

    // Find the nearest unoccupied anchor
    let chosenIndex = -1;
    for (let i = 0; i < bldg.anchors.length; i++) {
      if (!bldg.anchors[i].occupied) {
        chosenIndex = i;
        bldg.anchors[i].occupied = true;
        break;
      }
    }

    // Fallback: if all anchors occupied, just pick an offset position
    let targetX, targetZ;
    if (chosenIndex >= 0) {
      targetX = bldg.anchors[chosenIndex].x;
      targetZ = bldg.anchors[chosenIndex].z;
    } else {
      const angle = Math.random() * Math.PI * 2;
      targetX = bldg.position.x + Math.cos(angle) * 2.2;
      targetZ = bldg.position.z + Math.sin(angle) * 2.2;
    }

    // Store base position for bobbing animation
    mesh.userData.baseX = targetX;
    mesh.userData.baseY = 0.25;
    mesh.userData.baseZ = targetZ;

    let marching = false;

    if (this.marchInManager) {
      // March in from nearest map edge
      const { id: marchId } = this.marchInManager.startMarch(mesh, targetX, 0.25, targetZ);
      this._marchToSession.set(marchId, session.id);
      marching = true;
    } else {
      // Spawn slightly off-target so the unit can lerp in
      const spawnOffset = 0.6;
      mesh.position.set(
        targetX + (Math.random() - 0.5) * spawnOffset,
        0.25,
        targetZ + (Math.random() - 0.5) * spawnOffset
      );
    }

    this.scene.add(mesh);

    // Dust burst at spawn position
    if (this.particles) {
      this.particles.spawnDust(mesh.position);
    }

    this.units.set(session.id, {
      mesh,
      state: session.state,
      groupId: session.group,
      anchorIndex: chosenIndex,
      targetPos: new THREE.Vector3(targetX, 0.25, targetZ),
      session,
      sentinelRing: null,
      lastParticleTime: 0,
      marching,
    });
  }

  // ---------------------------------------------------------------------------
  // removeUnit
  // ---------------------------------------------------------------------------

  /**
   * Remove a unit from the world and free its anchor.
   * @param {string} sessionId
   */
  removeUnit(sessionId) {
    const unit = this.units.get(sessionId);
    if (!unit) return;

    // Gravestone at the unit's position
    if (this.marchInManager) {
      this.marchInManager.placeGravestone(unit.mesh.position.x, 0, unit.mesh.position.z);
    }

    // Death motes at the unit's position
    if (this.particles) {
      this.particles.spawnDeathMotes(unit.mesh.position);
    }

    // Clean up sentinel ring if present
    if (unit.sentinelRing && this.particles) {
      this.particles.removeRing(unit.sentinelRing);
      unit.sentinelRing = null;
    }

    // Free anchor
    if (unit.anchorIndex >= 0) {
      const bldg = this.buildings.get(unit.groupId);
      if (bldg && bldg.anchors[unit.anchorIndex]) {
        bldg.anchors[unit.anchorIndex].occupied = false;
      }
    }

    // Clean up CSS2DObject DOM elements (e.g. await "!" labels)
    const css2dObjects = [];
    unit.mesh.traverse(child => {
      if (child.isCSS2DObject || (child.element && child.element.parentNode)) {
        css2dObjects.push(child);
      }
    });
    for (const obj of css2dObjects) {
      if (obj.element && obj.element.parentNode) {
        obj.element.parentNode.removeChild(obj.element);
      }
      obj.parent?.remove(obj);
    }

    // Remove from scene and dispose per-unit resources (skip shared/cached ones)
    this.scene.remove(unit.mesh);
    const sharedGeoms = _geomCache;
    const sharedMats = _accessoryMatCache;
    unit.mesh.traverse(child => {
      if (child.geometry && !_isShared(child.geometry, sharedGeoms)) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { if (!_isShared(m, sharedMats)) m.dispose(); });
        } else if (!_isShared(child.material, sharedMats)) {
          child.material.dispose();
        }
      }
    });

    this.units.delete(sessionId);
  }

  // ---------------------------------------------------------------------------
  // animate — called every frame
  // ---------------------------------------------------------------------------

  /**
   * Per-frame animation tick.
   * @param {number} time  — elapsed time in seconds
   * @param {number} delta — time since last frame in seconds
   */
  animate(time, delta) {
    // ── March-in and gravestone updates ──────────────────────────────────
    if (this.marchInManager) {
      const completedMarches = this.marchInManager.updateMarches(delta);
      for (const marchId of completedMarches) {
        const sessionId = this._marchToSession.get(marchId);
        if (sessionId) {
          const u = this.units.get(sessionId);
          if (u) u.marching = false;
          this._marchToSession.delete(marchId);
        }
      }
      this.marchInManager.updateGravestones(delta);
    }

    for (const [sessionId, unit] of this.units) {
      const { mesh, state, groupId, targetPos, session } = unit;
      const bldg = this.buildings.get(groupId);
      const activityPair = bldg ? bldg.activityPair : null;

      // ── State-driven visual changes (color, emissive, opacity) ─────────
      // Run BEFORE activity so speedMultiplier can gate animations
      const { speedMultiplier } = applyStateVisuals(mesh, state, time);

      // ── Activity-driven animation ──────────────────────────────────────
      let usesPatrol = false;
      if (speedMultiplier > 0 && activityPair) {
        const isEnergetic = state === 'active';
        const activity = isEnergetic ? activityPair.energetic : activityPair.passive;
        // Scale time by speedMultiplier for slower idle/awaiting animations
        activity.animate(mesh, time * speedMultiplier, delta);
        usesPatrol = activity.name === 'Patrolling' || activity.name === 'Foraging';
      } else if (speedMultiplier > 0) {
        animBob(mesh, time * speedMultiplier);
      }

      // ── Child-process indicator ────────────────────────────────────────
      if (session) {
        updateChildIndicator(mesh, session.has_children, time);
      }

      // ── Smooth positional lerp toward anchor target ────────────────────
      // Skip lerp for patrol/foraging or marching units
      if (!usesPatrol && !unit.marching) {
        lerpToTarget(mesh, targetPos, delta);
      }

      // ── Class-specific particle effects ────────────────────────────────
      if (this.particles && session && speedMultiplier > 0) {
        this._updateUnitParticles(unit, time, session);
      }
    }

    // ── Building idle animations (subtle) ────────────────────────────────
    for (const [, bldg] of this.buildings) {
      if (bldg.abandoned) continue;
      // Gentle breathing scale on Y axis
      const scale = 1.0 + Math.sin(time * 0.5) * 0.005;
      bldg.mesh.scale.setY(scale);
    }
  }

  // ---------------------------------------------------------------------------
  // _updateUnitParticles — class-specific particle spawning with cooldowns
  // ---------------------------------------------------------------------------

  /**
   * Spawn particles based on unit class at a controlled rate.
   * @param {object} unit — unit record from this.units
   * @param {number} time — elapsed time
   * @param {object} session — session data
   */
  _updateUnitParticles(unit, time, session) {
    const unitClass = unit.mesh.userData.unitClass;
    if (!unitClass) return;

    // Cooldown intervals (seconds) per class
    const COOLDOWNS = {
      Builder:  2.5,
      Scholar:  4.0,
      Ghost:    3.0,
    };

    const cooldown = COOLDOWNS[unitClass];
    if (!cooldown) {
      // Sentinel uses persistent rings, not timed bursts
      this._updateSentinelRing(unit, session);
      return;
    }

    if (time - unit.lastParticleTime < cooldown) return;
    unit.lastParticleTime = time;

    const pos = unit.mesh.position;

    switch (unitClass) {
      case 'Builder':
        this.particles.spawnBuilderSparks(pos);
        break;
      case 'Scholar':
        this.particles.spawnScholarPages(pos);
        break;
      case 'Ghost':
        this.particles.spawnGhostWisps(pos);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // _updateSentinelRing — create/remove persistent sentinel ring
  // ---------------------------------------------------------------------------

  /**
   * Manages the sentinel ring lifecycle: create when unit becomes Sentinel,
   * remove when it transitions away.
   * @param {object} unit
   * @param {object} session
   */
  _updateSentinelRing(unit, session) {
    const isSentinel = classifyUnit(session) === 'Sentinel';

    if (isSentinel && !unit.sentinelRing) {
      unit.sentinelRing = this.particles.createSentinelRing(unit.mesh.position);
    } else if (!isSentinel && unit.sentinelRing) {
      this.particles.removeRing(unit.sentinelRing);
      unit.sentinelRing = null;
    }

    // Keep ring position synced with unit
    if (unit.sentinelRing) {
      unit.sentinelRing.mesh.position.x = unit.mesh.position.x;
      unit.sentinelRing.mesh.position.z = unit.mesh.position.z;
    }
  }

  // ---------------------------------------------------------------------------
  // _generateAnchors — semicircle positions around a building
  // ---------------------------------------------------------------------------

  /**
   * Generate evenly-spaced anchor positions in a circle around a building center.
   * @param {number} centerX
   * @param {number} centerZ
   * @param {number} count
   * @param {number} radius
   * @returns {Array<{ x: number, z: number, occupied: boolean }>}
   */
  _generateAnchors(centerX, centerZ, count = 8, radius = 1.8) {
    const anchors = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const jitterX = (Math.random() - 0.5) * 0.4;
      const jitterZ = (Math.random() - 0.5) * 0.4;
      anchors.push({
        x: centerX + Math.cos(angle) * radius + jitterX,
        z: centerZ + Math.sin(angle) * radius + jitterZ,
        occupied: false,
      });
    }
    return anchors;
  }
}

/** Check if an object is a value in a Map cache (shared, should not be disposed). */
function _isShared(obj, cacheMap) {
  for (const cached of cacheMap.values()) {
    if (cached === obj) return true;
  }
  return false;
}

export default WorldManager;
