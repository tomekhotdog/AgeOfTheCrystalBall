// scene.js — Three.js scene setup: camera, lights, renderer, CSS2DRenderer, zoom.
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Zoom constants
// ---------------------------------------------------------------------------
const DEFAULT_VIEW_SIZE = 14;
const MIN_VIEW_SIZE     = 6;   // close tactical
const MAX_VIEW_SIZE     = 30;  // wide strategic
const ZOOM_SPEED        = 0.002; // scroll-wheel sensitivity
const ZOOM_LERP_FACTOR  = 6;    // higher = snappier interpolation

// ---------------------------------------------------------------------------
// Internal: apply a viewSize to the orthographic camera frustum.
// ---------------------------------------------------------------------------
function applyCameraFrustum(camera, viewSize) {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left   = -viewSize * aspect / 2;
  camera.right  =  viewSize * aspect / 2;
  camera.top    =  viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// createZoomController — smooth scroll-wheel zoom for an orthographic camera.
//
//   Listens for `wheel` events on the given DOM element.
//   Call `update(delta)` every frame to lerp toward the target viewSize.
// ---------------------------------------------------------------------------
function createZoomController(camera, domElement) {
  let currentViewSize = DEFAULT_VIEW_SIZE;
  let targetViewSize  = DEFAULT_VIEW_SIZE;

  // Track cursor NDC for zoom-to-cursor
  let cursorNdcX = 0;
  let cursorNdcY = 0;
  domElement.addEventListener('pointermove', (e) => {
    const rect = domElement.getBoundingClientRect();
    cursorNdcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    cursorNdcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  // Optional callback when zoom-induced panning occurs
  let onPanCallback = null;

  // Reusable vectors for unproject
  const _before = new THREE.Vector3();
  const _after  = new THREE.Vector3();

  // --- Scroll-wheel listener ---
  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Positive deltaY = scroll down = zoom out (increase viewSize)
    targetViewSize += e.deltaY * ZOOM_SPEED * targetViewSize;
    targetViewSize = THREE.MathUtils.clamp(targetViewSize, MIN_VIEW_SIZE, MAX_VIEW_SIZE);
  }, { passive: false });

  return {
    /**
     * Smoothly interpolate currentViewSize toward targetViewSize and
     * update the camera frustum. Pans the camera so the world point
     * under the cursor stays fixed (zoom-to-cursor).
     * @param {number} delta — seconds since last frame (from Clock.getDelta)
     */
    update(delta) {
      const oldViewSize = currentViewSize;
      // Lerp factor scaled by delta so speed is frame-rate-independent.
      const t = 1 - Math.exp(-ZOOM_LERP_FACTOR * delta);
      currentViewSize = THREE.MathUtils.lerp(currentViewSize, targetViewSize, t);

      const dv = currentViewSize - oldViewSize;
      if (Math.abs(dv) > 0.0001) {
        // Ensure world matrix is fresh (arrow keys may have moved camera this frame)
        camera.updateMatrixWorld();

        // World point under cursor BEFORE frustum change
        _before.set(cursorNdcX, cursorNdcY, 0).unproject(camera);

        // Apply new frustum
        applyCameraFrustum(camera, currentViewSize);

        // World point under cursor AFTER frustum change
        _after.set(cursorNdcX, cursorNdcY, 0).unproject(camera);

        // Shift camera so the cursor-world point stays fixed (XZ only, keep Y)
        const dx = _before.x - _after.x;
        const dz = _before.z - _after.z;
        camera.position.x += dx;
        camera.position.z += dz;

        if (onPanCallback) onPanCallback(dx, dz);
      } else {
        applyCameraFrustum(camera, currentViewSize);
      }
    },

    /** @returns {number} the current (interpolated) viewSize */
    getCurrentViewSize() {
      return currentViewSize;
    },

    /**
     * Programmatically set the viewSize (clamped). Snaps both current and
     * target so there is no lerp transition.
     * @param {number} v
     */
    setViewSize(v) {
      const clamped = THREE.MathUtils.clamp(v, MIN_VIEW_SIZE, MAX_VIEW_SIZE);
      currentViewSize = clamped;
      targetViewSize  = clamped;
      applyCameraFrustum(camera, clamped);
    },

    /**
     * Register a callback for zoom-induced camera panning.
     * Receives (dx, dz) world-space shift so callers can sync lookAt targets.
     * @param {function(number, number): void} fn
     */
    setOnPan(fn) {
      onPanCallback = fn;
    },
  };
}

// ---------------------------------------------------------------------------
// createScene — main entry point.
//
// Returns:
//   { scene, camera, renderer, labelRenderer, clock,
//     dirLight, ambientLight, zoomController }
// ---------------------------------------------------------------------------
export function createScene() {
  // --- Scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xE8E0D4);

  // --- Orthographic camera at true isometric angle ---
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -DEFAULT_VIEW_SIZE * aspect / 2,
     DEFAULT_VIEW_SIZE * aspect / 2,
     DEFAULT_VIEW_SIZE / 2,
    -DEFAULT_VIEW_SIZE / 2,
    0.1,
    100
  );
  camera.position.set(10, 10, 10);
  camera.lookAt(0, 0, 0);

  // --- WebGL renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xE8E0D4);

  const container = document.getElementById('canvas-container');
  if (container) {
    container.appendChild(renderer.domElement);
  } else {
    document.body.appendChild(renderer.domElement);
  }

  // --- CSS2D label renderer (overlaid) ---
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  document.body.appendChild(labelRenderer.domElement);

  // --- Lights (exported so the day/night module can tweak them) ---
  const dirLight = new THREE.DirectionalLight(0xFFF5E6, 1.2);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.left   = -17;
  dirLight.shadow.camera.right  =  17;
  dirLight.shadow.camera.top    =  17;
  dirLight.shadow.camera.bottom = -17;
  dirLight.shadow.camera.near   =  0.5;
  dirLight.shadow.camera.far    =  50;
  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0x8899AA, 0.55);
  scene.add(ambientLight);

  // --- Zoom controller (scroll-wheel + smooth lerp) ---
  const zoomController = createZoomController(camera, renderer.domElement);

  // --- Clock ---
  const clock = new THREE.Clock();

  // --- Window resize handler ---
  // Uses the zoom controller's live viewSize so the frustum stays correct
  // after the user has zoomed in or out.
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    applyCameraFrustum(camera, zoomController.getCurrentViewSize());
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }

  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    labelRenderer,
    clock,
    dirLight,
    ambientLight,
    zoomController,
  };
}
