// activities.js -- Phase-named activity palette for animation.
import {
  animBob, animRock, animSway, animScribe, animKneel, animPatrol,
  animStrike, animHeadTilt, animBreathingPulse, animWalkStopExamine,
  animHeadNod, animTremor,
} from './animations.js';

/**
 * @typedef {{ name: string, animate: (mesh: THREE.Group, time: number, delta: number) => void, controlsPosition?: boolean }} Activity
 * @typedef {{ energetic: Activity, passive: Activity }} ActivityEntry
 */

/** @type {Object<string, ActivityEntry>} */
export const ACTIVITIES = {
  coding: {
    energetic: {
      name: 'coding-energetic',
      animate(mesh, time, _delta) {
        animStrike(mesh, time);
        animRock(mesh, time * 1.8);
      },
    },
    passive: {
      name: 'coding-passive',
      animate(mesh, time, _delta) {
        animScribe(mesh, time);
        animSway(mesh, time * 0.4);
      },
    },
  },

  researching: {
    energetic: {
      name: 'researching-energetic',
      controlsPosition: true,
      animate(mesh, time, _delta) {
        animPatrol(mesh, time, 1.5);
      },
    },
    passive: {
      name: 'researching-passive',
      controlsPosition: true,
      animate(mesh, time, _delta) {
        animWalkStopExamine(mesh, time, 0.6);
      },
    },
  },

  planning: {
    energetic: {
      name: 'planning-energetic',
      animate(mesh, time, _delta) {
        animHeadTilt(mesh, time);
        animSway(mesh, time);
      },
    },
    passive: {
      name: 'planning-passive',
      animate(mesh, time, _delta) {
        animBreathingPulse(mesh, time);
      },
    },
  },

  testing: {
    energetic: {
      name: 'testing-energetic',
      animate(mesh, time, _delta) {
        animStrike(mesh, time * 1.3);
        animRock(mesh, time * 2.5);
      },
    },
    passive: {
      name: 'testing-passive',
      animate(mesh, time, _delta) {
        animKneel(mesh, time);
        animSway(mesh, time * 0.3);
        animTremor(mesh, time);
      },
    },
  },

  reviewing: {
    energetic: {
      name: 'reviewing-energetic',
      animate(mesh, time, _delta) {
        // Fishing cast motion
        const cycle = time % 4;
        if (cycle < 1.0) {
          mesh.rotation.x = -0.2 * cycle;
        } else if (cycle < 1.5) {
          mesh.rotation.x = 0.3;
        } else {
          mesh.rotation.x = 0.05;
        }
        animBob(mesh, time * 0.5);
      },
    },
    passive: {
      name: 'reviewing-passive',
      controlsPosition: true,
      animate(mesh, time, _delta) {
        animWalkStopExamine(mesh, time, 0.6);
        animBob(mesh, time * 0.6);
      },
    },
  },

  idle: {
    energetic: {
      name: 'idle-energetic',
      animate(mesh, time, _delta) {
        animBreathingPulse(mesh, time);
        animSway(mesh, time);
      },
    },
    passive: {
      name: 'idle-passive',
      animate(mesh, time, _delta) {
        animHeadNod(mesh, time);
      },
    },
  },
};

const _activityValues = Object.values(ACTIVITIES);

/**
 * Returns the activity entry for a given group index (deterministic per index).
 * Cycles through the 6 phase-named activities.
 * @param {number} groupIndex
 * @returns {ActivityEntry}
 */
export function getActivityForGroup(groupIndex) {
  const len = _activityValues.length;
  return _activityValues[((groupIndex % len) + len) % len];
}

/**
 * Returns the activity entry for a session based on its sidecar phase.
 * Falls back to group-based activity if phase is unknown.
 * @param {number} groupIndex
 * @param {string|null} phase
 * @returns {ActivityEntry}
 */
export function getActivityForSession(groupIndex, phase) {
  if (phase && ACTIVITIES[phase]) return ACTIVITIES[phase];
  return getActivityForGroup(groupIndex);
}
