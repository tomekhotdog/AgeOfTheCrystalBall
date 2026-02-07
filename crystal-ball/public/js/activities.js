// activities.js — Activity palette mapping activity names to animation functions.
import { animBob, animRock, animSway, animScribe, animKneel, animPatrol } from './animations.js';

/**
 * @typedef {{ name: string, animate: (mesh: THREE.Group, time: number, delta: number) => void }} Activity
 * @typedef {{ energetic: Activity, passive: Activity }} ActivityPair
 */

/** @type {ActivityPair[]} */
export const ACTIVITY_PAIRS = [
  // 1. Building (hammering) / Scribing (writing)
  {
    energetic: {
      name: 'Building',
      animate(mesh, time, _delta) {
        animBob(mesh, time);
        animRock(mesh, time * 1.8); // faster rocking = hammering rhythm
      },
    },
    passive: {
      name: 'Scribing',
      animate(mesh, time, _delta) {
        animScribe(mesh, time);
        animSway(mesh, time * 0.4); // gentle sway while writing
      },
    },
  },

  // 2. Mining (pickaxe) / Praying (kneeling)
  {
    energetic: {
      name: 'Mining',
      animate(mesh, time, _delta) {
        animBob(mesh, time * 1.3);
        animRock(mesh, time * 2.0); // vigorous rocking = pickaxe swings
      },
    },
    passive: {
      name: 'Praying',
      animate(mesh, time, _delta) {
        animKneel(mesh, time);
        animSway(mesh, time * 0.3); // very gentle sway in prayer
      },
    },
  },

  // 3. Chopping (axe swing) / Resting (campfire)
  {
    energetic: {
      name: 'Chopping',
      animate(mesh, time, _delta) {
        animBob(mesh, time * 0.8);
        animRock(mesh, time * 2.5); // sharp rocking = axe swings
      },
    },
    passive: {
      name: 'Resting',
      animate(mesh, time, _delta) {
        // Slow gentle bob as if sitting by a campfire.
        const baseY = mesh.userData.baseY ?? 0;
        mesh.position.y = baseY + Math.sin(time * 0.5 * Math.PI) * 0.02;
        animSway(mesh, time * 0.2);
      },
    },
  },

  // 4. Smelting (furnace) / Foraging (wandering)
  {
    energetic: {
      name: 'Smelting',
      animate(mesh, time, _delta) {
        animBob(mesh, time * 1.1);
        animRock(mesh, time * 1.4);
      },
    },
    passive: {
      name: 'Foraging',
      animate(mesh, time, _delta) {
        // Slow wandering circle — small radius.
        animPatrol(mesh, time, 0.6);
        animBob(mesh, time * 0.6);
      },
    },
  },

  // 5. Fishing (casting) / Patrolling (walking loop)
  {
    energetic: {
      name: 'Fishing',
      animate(mesh, time, _delta) {
        // Casting motion: periodic forward lean + bob.
        const cycle = time % 4; // 4-second cast cycle
        if (cycle < 1.0) {
          // Wind-up
          mesh.rotation.x = -0.2 * cycle;
        } else if (cycle < 1.5) {
          // Cast forward
          mesh.rotation.x = 0.3;
        } else {
          // Waiting
          mesh.rotation.x = 0.05;
        }
        animBob(mesh, time * 0.5);
      },
    },
    passive: {
      name: 'Patrolling',
      animate(mesh, time, _delta) {
        animPatrol(mesh, time, 1.5);
      },
    },
  },
];

/**
 * Returns the activity pair for a given group index (deterministic per index).
 * @param {number} groupIndex
 * @returns {ActivityPair}
 */
export function getActivityForGroup(groupIndex) {
  return ACTIVITY_PAIRS[((groupIndex % ACTIVITY_PAIRS.length) + ACTIVITY_PAIRS.length) % ACTIVITY_PAIRS.length];
}
