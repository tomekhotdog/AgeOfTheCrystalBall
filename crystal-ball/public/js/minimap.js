// minimap.js — Phase 4.3
// Renders a 150x150px top-down overview canvas showing terrain, buildings,
// units, and the camera viewport rectangle.  Click-to-jump supported.

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

const TILE_COLORS = {
  grass:          '#6B8E5B',
  water:          '#4A7EB0',
  sand:           '#C8B278',
  mountain:       '#8B7355',
  mountain_peak:  '#8B7355',
  path:           '#A0926B',
  bridge:         '#A0926B',
};

const UNIT_STATE_COLORS = {
  active:   '#4ade80',
  awaiting: '#e8c84a',
  idle:     '#9e9e9e',
  stale:    '#6e6e6e',
};

/**
 * Convert world coordinates to minimap pixel coordinates.
 * World grid is gridSize x gridSize, ranging from -gridSize/2 to +gridSize/2 - 1.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} canvasSize — canvas dimension in pixels (150)
 * @param {number} gridSize — terrain grid size (28)
 * @returns {{ px: number, py: number }}
 */
export function worldToMinimap(worldX, worldZ, canvasSize = 150, gridSize = 28) {
  const half = gridSize / 2;
  const px = ((worldX + half) / gridSize) * canvasSize;
  const py = ((worldZ + half) / gridSize) * canvasSize;
  return { px, py };
}

/**
 * Convert minimap pixel coordinates to world coordinates.
 * @param {number} px
 * @param {number} py
 * @param {number} canvasSize
 * @param {number} gridSize
 * @returns {{ worldX: number, worldZ: number }}
 */
export function minimapToWorld(px, py, canvasSize = 150, gridSize = 28) {
  const half = gridSize / 2;
  const worldX = (px / canvasSize) * gridSize - half;
  const worldZ = (py / canvasSize) * gridSize - half;
  return { worldX, worldZ };
}

/**
 * Get the color for a tile type.
 * @param {string} tileType — 'grass', 'water', 'sand', 'mountain', 'mountain_peak', 'path', 'bridge'
 * @returns {string} CSS color
 */
export function tileColor(tileType) {
  return TILE_COLORS[tileType] ?? '#6B8E5B';   // default to grass
}

/**
 * Get the color for a unit state.
 * @param {string} state
 * @returns {string} CSS color
 */
export function unitStateColor(state) {
  return UNIT_STATE_COLORS[state] ?? '#9e9e9e'; // default to idle grey
}

// ---------------------------------------------------------------------------
// Minimap class
// ---------------------------------------------------------------------------

export class Minimap {
  /**
   * @param {object} terrain — terrain object with .tiles Map
   * @param {THREE.Camera} camera
   * @param {(worldX: number, worldZ: number) => void} onClickJump — callback to center camera
   */
  constructor(terrain, camera, onClickJump) {
    this.terrain = terrain;
    this.camera = camera;
    this.onClickJump = onClickJump;

    this.canvasSize = 150;
    this.gridSize = 28;

    /** @type {HTMLDivElement|null} */
    this.container = null;
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.ctx = null;
    /** @type {HTMLCanvasElement|null} */
    this.terrainCache = null;

    this._onClick = this._onClick.bind(this);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Create the canvas element and attach it to the DOM. */
  init() {
    // Container
    this.container = document.createElement('div');
    this.container.className = 'minimap-container';

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasSize;
    this.canvas.height = this.canvasSize;
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    // Pre-render the terrain layer once
    this._renderTerrainCache();

    // Click-to-jump
    this.canvas.addEventListener('click', this._onClick);
  }

  dispose() {
    if (this.canvas) {
      this.canvas.removeEventListener('click', this._onClick);
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.terrainCache = null;
  }

  // -----------------------------------------------------------------------
  // Visibility
  // -----------------------------------------------------------------------

  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (this.container) this.container.classList.remove('hidden');
  }

  hide() {
    if (this.container) this.container.classList.add('hidden');
  }

  isVisible() {
    return this.container ? !this.container.classList.contains('hidden') : false;
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  /**
   * Redraw the minimap with current world state.
   * Called each poll cycle.
   * @param {{ buildings: Map, units: Map }} worldManager
   */
  update(worldManager) {
    const ctx = this.ctx;
    if (!ctx || !this.isVisible()) return;

    // 1. Blit cached terrain
    if (this.terrainCache) {
      ctx.drawImage(this.terrainCache, 0, 0);
    }

    // 2. Buildings — white 4x4 squares
    if (worldManager.buildings) {
      ctx.fillStyle = '#ffffff';
      for (const [, building] of worldManager.buildings) {
        const wx = building.x ?? building.position?.x ?? 0;
        const wz = building.z ?? building.position?.z ?? 0;
        const { px, py } = worldToMinimap(wx, wz, this.canvasSize, this.gridSize);
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }

    // 3. Units — colored 2x2 dots
    if (worldManager.units) {
      for (const [, unit] of worldManager.units) {
        const wx = unit.x ?? unit.position?.x ?? 0;
        const wz = unit.z ?? unit.position?.z ?? 0;
        const state = unit.state ?? 'idle';
        ctx.fillStyle = unitStateColor(state);
        const { px, py } = worldToMinimap(wx, wz, this.canvasSize, this.gridSize);
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    // 4. Viewport rectangle
    this._drawViewport(ctx);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Pre-render the terrain layer to an off-screen canvas. */
  _renderTerrainCache() {
    this.terrainCache = document.createElement('canvas');
    this.terrainCache.width = this.canvasSize;
    this.terrainCache.height = this.canvasSize;
    const tctx = this.terrainCache.getContext('2d');

    const tileSize = this.canvasSize / this.gridSize;   // ~6.25
    const half = this.gridSize / 2;                       // 12

    if (this.terrain && this.terrain.tiles) {
      for (const [key, tile] of this.terrain.tiles) {
        const tileType = tile.type ?? tile;
        const parts = key.split(',');
        const gx = parseInt(parts[0], 10);
        const gz = parseInt(parts[1], 10);
        tctx.fillStyle = tileColor(tileType);
        const px = (gx + half) * tileSize;
        const pz = (gz + half) * tileSize;
        tctx.fillRect(px, pz, Math.ceil(tileSize), Math.ceil(tileSize));
      }
    } else {
      // Fallback: fill with grass
      tctx.fillStyle = tileColor('grass');
      tctx.fillRect(0, 0, this.canvasSize, this.canvasSize);
    }
  }

  /** Draw the camera viewport rectangle. */
  _drawViewport(ctx) {
    const cam = this.camera;
    if (!cam) return;

    // For an orthographic camera we can read the view size directly.
    // cam.top gives half the view height in world units.
    let viewH, viewW;
    if (cam.top !== undefined && cam.right !== undefined) {
      viewH = cam.top - cam.bottom;
      viewW = cam.right - cam.left;
    } else {
      // Fallback: assume a default orthographic viewSize
      const V = 12;
      const aspect = (typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1);
      viewW = V * aspect;
      viewH = V;
    }

    // Camera lookAt target — assume the camera is looking at a target stored
    // on a controls object, or approximate from position.
    let cx, cz;
    if (cam.target) {
      cx = cam.target.x;
      cz = cam.target.z;
    } else {
      // Isometric camera typically positioned at (d, d, d) looking toward origin.
      // Approximate by using the camera position projected to XZ.
      cx = cam.position ? cam.position.x : 0;
      cz = cam.position ? cam.position.z : 0;
    }

    const { px: vpx, py: vpy } = worldToMinimap(cx, cz, this.canvasSize, this.gridSize);
    const scale = this.canvasSize / this.gridSize;       // px per world unit
    const halfW = (viewW / 2) * scale;
    const halfH = (viewH / 2) * scale;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpx - halfW, vpy - halfH, halfW * 2, halfH * 2);
  }

  /** Handle click-to-jump. */
  _onClick(e) {
    if (!this.canvas || !this.onClickJump) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { worldX, worldZ } = minimapToWorld(px, py, this.canvasSize, this.gridSize);
    this.onClickJump(worldX, worldZ);
  }
}
