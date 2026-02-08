// main.js — Entry point that wires together scene, terrain, world manager,
// selection, HUD, day/night, post-processing, loading screen, and API polling.

import { createScene } from './scene.js';
import { generateTerrain } from './terrain.js';
import { WorldManager } from './worldManager.js';
import { SelectionManager } from './selection.js';
import { SelectionPanel } from './selectionPanel.js';
import { updateHUD } from './hud.js';
import { ApiPoller } from './api.js';
import { DayNightCycle } from './daynight.js';
import { setupPostProcessing, onResize as resizeComposer } from './postprocessing.js';
import { LoadingScreen, CameraIntro } from './loading.js';
import { ParticleSystem } from './particles.js';
import { HealthBarManager } from './healthbars.js';
import { HotkeyManager } from './hotkeys.js';
import { WarRoom } from './warroom.js';
import { TooltipManager } from './tooltips.js';
import { Minimap } from './minimap.js';
import { CameraRotation } from './cameraRotation.js';
import { Heatmap } from './heatmap.js';
import { MarchInManager } from './marchIn.js';
import { TownHall, VictoryScreen } from './townhall.js';
import { DoubleClickHandler } from './doubleClick.js';
import { MemoryScaler } from './memoryScale.js';
import { PerfMonitor } from './perfMonitor.js';
import { computeEdgeScrollDir } from './edgeScroll.js';
import { createLanterns, updateLanterns } from './lanterns.js';
import { RosterPanel } from './roster.js';
import { SharingPanel } from './sharingPanel.js';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  // ── 0. Loading screen (shows immediately) ─────────────────────────────
  const loadingScreen = new LoadingScreen();
  loadingScreen.setProgress(0.1);

  // ── 1. Scene, camera, renderers, lights, zoom ─────────────────────────
  const {
    scene, camera, renderer, labelRenderer, clock,
    dirLight, ambientLight, zoomController
  } = createScene();
  loadingScreen.setProgress(0.2);

  // ── 2. Post-processing (bloom + vignette) ─────────────────────────────
  const { composer, bloomPass } = setupPostProcessing(renderer, scene, camera);
  const perf = new PerfMonitor(renderer);
  loadingScreen.setProgress(0.3);

  // ── 3. Terrain ────────────────────────────────────────────────────────
  const terrain = generateTerrain(scene);
  loadingScreen.setProgress(0.5);

  // ── 4. Day/night cycle ────────────────────────────────────────────────
  const dayNight = new DayNightCycle({ dirLight, ambientLight, scene });

  // ── 5. GR Town Hall (permanent central building) ─────────────────────
  const townHall = new TownHall(scene);
  townHall.createMesh();
  terrain.markTileUsed(0, 0); // reserve center tile

  // ── 6. Particle system + health bars ────────────────────────────────
  const particles = new ParticleSystem(scene);
  const healthBars = new HealthBarManager(scene);

  // ── 7. March-in manager (reinforcement animations + gravestones) ────
  const marchInManager = new MarchInManager(scene);

  // ── 8. World Manager ──────────────────────────────────────────────────
  const worldManager = new WorldManager(scene, terrain, particles, healthBars, marchInManager);
  loadingScreen.setProgress(0.6);

  // ── 9. Heatmap + Memory Scaler + Victory Screen ─────────────────────
  const heatmap = new Heatmap(terrain);
  const memoryScaler = new MemoryScaler();
  const victoryScreen = new VictoryScreen(particles);

  // ── 10. Selection Panel ─────────────────────────────────────────────
  const selectionPanel = new SelectionPanel();

  // Latest data received from the API (shared closure)
  let latestApiData = { timestamp: null, sessions: [], groups: [] };

  // Lanterns (created once after first buildings appear)
  let lanterns = null;

  // Forward-declared: doubleClickHandler (needs selectionManager which is below)
  let doubleClickHandler = null;

  // ── 11. Selection Manager ─────────────────────────────────────────────
  const selectionManager = new SelectionManager(
    camera, scene, worldManager,
    // onSelectUnit
    (sessionId) => {
      const session = latestApiData.sessions.find(s => s.id === sessionId);
      if (session) selectionPanel.showUnit(session);
      // Double-click detection
      const unit = worldManager.units.get(sessionId);
      if (doubleClickHandler && unit) {
        doubleClickHandler.handleUnitClick(sessionId, unit.mesh.userData.unitClass);
      }
    },
    // onSelectMultiple
    (sessionIds) => {
      const sessions = sessionIds
        .map(id => latestApiData.sessions.find(s => s.id === id))
        .filter(Boolean);
      if (sessions.length > 0) selectionPanel.showMultiUnit(sessions);
    },
    // onSelectBuilding
    (groupId) => {
      const group = latestApiData.groups.find(g => g.id === groupId);
      if (group) {
        const groupSessions = latestApiData.sessions.filter(s => s.group === groupId);
        selectionPanel.showGroup(group, groupSessions);
      }
      // Double-click detection
      if (doubleClickHandler) {
        doubleClickHandler.handleBuildingClick(groupId);
      }
    },
    // onDeselect
    () => selectionPanel.hide()
  );
  selectionManager.init(renderer.domElement);
  loadingScreen.setProgress(0.7);

  // ── 12. Double-click handler ────────────────────────────────────────
  doubleClickHandler = new DoubleClickHandler({
    worldManager,
    selectionManager,
    getLatestData: () => latestApiData,
    onSelectMultiple: (sessionIds) => {
      const sessions = sessionIds
        .map(id => latestApiData.sessions.find(s => s.id === id))
        .filter(Boolean);
      if (sessions.length > 0) selectionPanel.showMultiUnit(sessions);
    },
  });

  // ── 13. Camera rotation ─────────────────────────────────────────────
  const cameraRotation = new CameraRotation(camera);

  // Sync zoom-to-cursor panning with cameraRotation lookAt target
  zoomController.setOnPan((dx, dz) => {
    const target = cameraRotation.getLookAtTarget();
    cameraRotation.setLookAtTarget(target.x + dx, target.z + dz);
  });

  // ── 14. Camera panning (isometric-aware) ────────────────────────────
  setupCameraPanning(renderer.domElement, camera, selectionManager, cameraRotation);

  // ── 15. War Room panel ─────────────────────────────────────────────
  const warRoom = new WarRoom();

  // ── 16. Tooltips ───────────────────────────────────────────────────
  const tooltipManager = new TooltipManager(camera, scene, () => latestApiData);
  tooltipManager.init(renderer.domElement);

  // ── 17. Minimap ────────────────────────────────────────────────────
  const minimap = new Minimap(terrain, camera, (worldX, worldZ) => {
    camera.position.set(worldX + 10, 10, worldZ + 10);
    camera.lookAt(worldX, 0, worldZ);
    cameraRotation.setLookAtTarget(worldX, worldZ);
  });
  minimap.init();

  // ── 18. Quality mode (low = no bloom/vignette, high = full post-processing)
  let qualityHigh = true;

  // ── 19. Hotkeys ─────────────────────────────────────────────────────
  const hotkeyManager = new HotkeyManager({
    worldManager,
    selectionManager,
    camera,
    zoomController,
    getLatestData: () => latestApiData,
    onShowMultiUnit: (sessions) => selectionPanel.showMultiUnit(sessions),
  });
  hotkeyManager.init();

  // ── Edge-scroll cursor tracking ────────────────────────────────────
  let cursorX = -1, cursorY = -1;
  let cursorInWindow = false;

  window.addEventListener('pointermove', (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    cursorInWindow = true;
  });
  document.addEventListener('pointerleave', () => { cursorInWindow = false; });

  // ── Arrow key / WASD camera movement (held keys, isometric-aware) ───
  const keysHeld = new Set();
  const ARROW_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

  // Additional hotkey bindings (Q/E rotation, Tab war room, M minimap, H heatmap, arrows)
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (ARROW_KEYS.has(key)) { e.preventDefault(); keysHeld.add(key); }
    if (key === 'q') cameraRotation.rotateLeft();
    if (key === 'e') cameraRotation.rotateRight();
    if (key === 'tab') { e.preventDefault(); warRoom.toggle(); }
    if (key === 'm') minimap.toggle();
    if (key === 'h') heatmap.toggle();
    if (key === 'u') rosterPanel.toggle();
    if (key === '?' || key === '/') {
      const helpEl = document.getElementById('hotkey-help');
      if (helpEl) helpEl.classList.toggle('hidden');
    }
    if (key === 'g') {
      qualityHigh = !qualityHigh;
      console.log(`Quality: ${qualityHigh ? 'HIGH (bloom+vignette)' : 'LOW (direct render)'}`);
    }
    if (key === 'p' && e.shiftKey) { perf.copySnapshot(); }
    else if (key === 'p') perf.toggle();
  });
  window.addEventListener('keyup', (e) => {
    keysHeld.delete(e.key.toLowerCase());
  });

  // ── 19. Window resize handler (includes post-processing) ────────────
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    resizeComposer(composer, w, h);
  });

  // ── 20. API Poller ──────────────────────────────────────────────────
  const poller = new ApiPoller(2000);
  let firstDataReceived = false;

  // Detect mode before first poll (async start)
  await poller.start((data) => {
    latestApiData = data;
    worldManager.update(data);
    updateHUD(data);
    warRoom.update(data);
    minimap.update(worldManager);
    heatmap.update(data, worldManager.buildings);
    memoryScaler.updateTargets(data.sessions);
    victoryScreen.update(data.sessions, particles);

    // Update multi-person panels
    if (rosterPanel) rosterPanel.update(data);
    if (sharingPanel) sharingPanel.updateGroups(data);

    if (!firstDataReceived) {
      firstDataReceived = true;
      loadingScreen.setProgress(1.0);
      // Add decorations after first world update so buildings are placed
      terrain.addDecorations(scene);
      // Place lanterns between buildings
      lanterns = createLanterns(scene, worldManager.getBuildingPositions(), terrain);
      // Merge static geometry to cut draw calls
      const mergeResult = terrain.mergeStaticGeometry();
      heatmap.setMergeSwap(mergeResult);
      // Hide loading screen and start camera intro
      onFirstData();
    }
  });

  // ── 20b. Multi-person panels (after mode detection) ────────────────
  const rosterPanel = new RosterPanel(poller.userInfo);
  const sharingPanel = new SharingPanel(poller.mode);

  // ── 21. Camera intro (after loading screen hides) ───────────────────
  let cameraIntro = null;

  async function onFirstData() {
    await loadingScreen.hide();
    cameraIntro = new CameraIntro({ camera, zoomController });
  }

  // ── 22. Animation loop ──────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    perf.beginFrame();

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Camera panning (arrow keys + edge scroll)
    perf.mark('camera');
    let panDx = 0, panDz = 0;

    // Arrow keys
    if (keysHeld.has('arrowup'))    { panDx -= 1; panDz -= 1; }
    if (keysHeld.has('arrowdown'))  { panDx += 1; panDz += 1; }
    if (keysHeld.has('arrowleft')) { panDx -= 1; panDz += 1; }
    if (keysHeld.has('arrowright')){ panDx += 1; panDz -= 1; }

    // Edge scroll (skip when cursor is over UI elements)
    if (cursorInWindow) {
      const overUI = document.querySelector('.minimap-container:hover, .war-room:hover, .hotkey-help:hover');
      if (!overUI) {
        const edge = computeEdgeScrollDir(cursorX, cursorY, window.innerWidth, window.innerHeight);
        if (edge) { panDx += edge.dx; panDz += edge.dz; }
      }
    }

    if (panDx !== 0 || panDz !== 0) {
      const PAN_SPEED = 8; // world units per second
      const len = Math.sqrt(panDx * panDx + panDz * panDz) || 1;
      const moveX = (panDx / len) * PAN_SPEED * delta;
      const moveZ = (panDz / len) * PAN_SPEED * delta;
      camera.position.x += moveX;
      camera.position.z += moveZ;
      const target = cameraRotation.getLookAtTarget();
      cameraRotation.setLookAtTarget(target.x + moveX, target.z + moveZ);
      camera.lookAt(camera.position.x - 10, 0, camera.position.z - 10);
    }
    zoomController.update(delta);
    cameraRotation.update(delta);
    if (cameraIntro) {
      const still = cameraIntro.update(delta);
      if (!still) cameraIntro = null;
    }

    // Day/night cycle
    perf.mark('daynight');
    dayNight.update(elapsed);
    const phase = dayNight.getPhase();
    if (qualityHigh) {
      bloomPass.strength = phase === 'night' ? 0.6 : phase === 'dusk' ? 0.45 : 0.3;
    }
    if (lanterns) {
      updateLanterns(lanterns, phase, dayNight.getPhaseProgress());
    }

    // Night factor (0-1) for building glow — same ramp as lanterns
    let nightFactor = 0;
    if (phase === 'night') nightFactor = 1;
    else if (phase === 'dusk') nightFactor = dayNight.getPhaseProgress();
    else if (phase === 'dawn') nightFactor = 1 - dayNight.getPhaseProgress();

    // Memory-based size scaling
    perf.mark('memScale');
    memoryScaler.animate(worldManager.units, delta);

    // World (units, buildings, activities, state visuals, march-in)
    perf.mark('world');
    worldManager.animate(elapsed, delta, nightFactor);

    // Particle effects
    perf.mark('particles');
    particles.update(elapsed, delta);

    // Health bar billboards (face camera)
    perf.mark('healthbars');
    healthBars.updateAllBillboards(camera);

    // Minimap viewport (per-frame for smooth tracking)
    minimap.drawViewport();

    // Water animation
    perf.mark('water');
    terrain.animateWater(elapsed);

    // GPU: render (high = bloom+vignette composer, low = direct)
    perf.mark('render');
    if (qualityHigh) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }

    // CSS2D label pass
    perf.mark('labels');
    labelRenderer.render(scene, camera);

    perf.endFrame();
  }

  animate();
}

// ---------------------------------------------------------------------------
// Camera panning
// ---------------------------------------------------------------------------

function setupCameraPanning(canvas, camera, selectionManager, cameraRotation) {
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    // Skip panning when box-selecting
    if (selectionManager && selectionManager.isBoxSelecting) return;

    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const panSpeed = 0.02;
    const moveX = -(dx + dy) * panSpeed * 0.7;
    const moveZ = -(-dx + dy) * panSpeed * 0.7;

    camera.position.x += moveX;
    camera.position.z += moveZ;

    // Sync the camera rotation's lookAt target with panning
    if (cameraRotation) {
      const target = cameraRotation.getLookAtTarget();
      cameraRotation.setLookAtTarget(target.x + moveX, target.z + moveZ);
    }
    camera.lookAt(camera.position.x - 10, 0, camera.position.z - 10);
  });

  window.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    isDragging = false;
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
