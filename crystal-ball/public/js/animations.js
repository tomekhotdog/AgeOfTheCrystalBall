// animations.js — Pure animation functions that modify mesh transforms.
// Each function signature: (mesh, time[, ...extra])

/**
 * Sinusoidal Y-axis bob. Period ~2s, amplitude 0.05.
 * Reads mesh.userData.baseY for the resting position.
 */
export function animBob(mesh, time) {
  const baseY = mesh.userData.baseY ?? 0;
  mesh.position.y = baseY + Math.sin(time * Math.PI) * 0.05;
}

/**
 * Sinusoidal X-rotation tilt (rocking side-to-side). Period ~1.5s, angle 0.15 rad.
 */
export function animRock(mesh, time) {
  mesh.rotation.x = Math.sin(time * (Math.PI * 2 / 1.5)) * 0.15;
}

/**
 * Sinusoidal Z-rotation sway. Period ~2.5s, angle 0.08 rad.
 */
export function animSway(mesh, time) {
  mesh.rotation.z = Math.sin(time * (Math.PI * 2 / 2.5)) * 0.08;
}

/**
 * Emissive glow oscillation. Needs mesh.material.emissive to exist.
 * @param {THREE.Mesh} mesh
 * @param {number} time
 * @param {THREE.Color|number} color — the target emissive color
 */
export function animPulse(mesh, time, color) {
  if (!mesh.material || !mesh.material.emissive) return;
  const intensity = 0.3 + 0.3 * Math.sin(time * Math.PI * 2);
  mesh.material.emissive.set(color);
  mesh.material.emissiveIntensity = intensity;
}

/**
 * Circular patrol path movement around base position.
 * @param {THREE.Mesh|THREE.Group} mesh
 * @param {number} time
 * @param {number} [radius=1.5]
 */
export function animPatrol(mesh, time, radius = 1.5) {
  const baseX = mesh.userData.baseX ?? 0;
  const baseZ = mesh.userData.baseZ ?? 0;
  const speed = 0.4; // revolutions per ~15 seconds
  const angle = time * speed;
  mesh.position.x = baseX + Math.cos(angle) * radius;
  mesh.position.z = baseZ + Math.sin(angle) * radius;
  // Face movement direction
  mesh.rotation.y = -angle + Math.PI / 2;
}

/**
 * Kneel posture — one-time (non-cyclic): scale Y to 0.7, slight forward tilt.
 */
export function animKneel(mesh, _time) {
  mesh.scale.y = 0.7;
  mesh.rotation.x = 0.25; // forward lean
}

/**
 * Small rapid bobbing — writing / scribing motion.
 * Amplitude 0.02, speed 4.
 */
export function animScribe(mesh, time) {
  const baseY = mesh.userData.baseY ?? 0;
  mesh.position.y = baseY + Math.sin(time * 4 * Math.PI * 2) * 0.02;
}

/**
 * Asymmetric hammer strike: fast down, brief pause at bottom, slow rise.
 * Amplitude 0.05, period ~1.2s.
 */
export function animStrike(mesh, time) {
  const baseY = mesh.userData.baseY ?? 0;
  // Shape: fast down via abs(sin), asymmetry from power curve
  const cycle = (time * 1.2) % 1.0;
  const down = Math.abs(Math.sin(cycle * Math.PI));
  const shaped = Math.pow(down, 0.6); // fast down, slow rise
  mesh.position.y = baseY + (1 - shaped) * 0.05;
}

/**
 * Periodic Z-rotation tilt (0.12 rad) with brief freeze every ~3s.
 */
export function animHeadTilt(mesh, time) {
  const period = 3.0;
  const cycle = time % period;
  // Tilt for 2s, freeze for 1s
  if (cycle < 2.0) {
    mesh.rotation.z = Math.sin((cycle / 2.0) * Math.PI * 2) * 0.12;
  } else {
    mesh.rotation.z = 0;
  }
}

/**
 * Breathing pulse: scale.y oscillates 0.98-1.02, period ~3s.
 */
export function animBreathingPulse(mesh, time) {
  mesh.scale.y = 1.0 + Math.sin(time * (Math.PI * 2 / 3.0)) * 0.02;
}

/**
 * Walk-stop-examine: patrol with periodic 2s pauses.
 * During pause, scale.y dips to 0.9 briefly (examining).
 * @param {THREE.Mesh|THREE.Group} mesh
 * @param {number} time
 * @param {number} [radius=0.6]
 */
export function animWalkStopExamine(mesh, time, radius = 0.6) {
  const baseX = mesh.userData.baseX ?? 0;
  const baseZ = mesh.userData.baseZ ?? 0;
  const cyclePeriod = 6.0; // 4s walk + 2s stop
  const cycle = time % cyclePeriod;

  if (cycle < 4.0) {
    // Walking phase
    const speed = 0.4;
    const angle = time * speed;
    mesh.position.x = baseX + Math.cos(angle) * radius;
    mesh.position.z = baseZ + Math.sin(angle) * radius;
    mesh.rotation.y = -angle + Math.PI / 2;
    mesh.scale.y = 1.0;
  } else {
    // Stop and examine phase
    const examineProgress = (cycle - 4.0) / 2.0; // 0..1
    const dip = Math.sin(examineProgress * Math.PI);
    mesh.scale.y = 1.0 - dip * 0.1; // dip to 0.9 at peak
  }
}

/**
 * Periodic head nod: rotation.x dip (0.15 rad) every ~4s, quick down + slow return.
 */
export function animHeadNod(mesh, time) {
  const period = 4.0;
  const cycle = time % period;
  if (cycle < 0.8) {
    // Quick nod down + slow return
    const t = cycle / 0.8;
    const curve = t < 0.3 ? (t / 0.3) : 1.0 - ((t - 0.3) / 0.7);
    mesh.rotation.x = curve * 0.15;
  } else {
    mesh.rotation.x = 0;
  }
}

/**
 * Tiny rapid X-axis vibration. Amplitude 0.005, high frequency.
 * Layered on top of other animations.
 */
export function animTremor(mesh, time) {
  mesh.position.x += Math.sin(time * 30) * 0.005;
}

/**
 * Smooth position lerp toward a target { x, y, z }.
 * @param {THREE.Object3D} mesh
 * @param {{ x: number, y: number, z: number }} target
 * @param {number} delta — frame delta in seconds
 * @param {number} [speed=2]
 */
export function lerpToTarget(mesh, target, delta, speed = 2) {
  const t = 1 - Math.exp(-speed * delta);
  mesh.position.x += (target.x - mesh.position.x) * t;
  mesh.position.y += (target.y - mesh.position.y) * t;
  mesh.position.z += (target.z - mesh.position.z) * t;
}
