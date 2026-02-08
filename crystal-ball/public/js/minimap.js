// minimap.js — 150x150px top-down overview with terrain, buildings, units,
// and an accurate isometric viewport polygon. Click-to-jump supported.
//
// Two-phase rendering:
//   update(worldManager)  -- per-poll: terrain + entities -> _worldCache
//   drawViewport()        -- per-frame: _worldCache + viewport polygon -> canvas

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

const TILE_COLORS = {
  grass:          '#88C878',
  water:          '#58A8D0',
  sand:           '#E0C890',
  mountain:       '#B0A898',
  mountain_peak:  '#B0A898',
  mountain_plateau: '#B4B098',
  path:           '#D0C4A8',
  bridge:         '#D0C4A8',
};

const UNIT_STATE_COLORS = {
  active:   '#60D890',
  awaiting: '#F0C050',
  idle:     '#B0ACB0',
  stale:    '#C86868',
  blocked:  '#D87068',
};

/**
 * Convert world coordinates to minimap pixel coordinates.
 * World grid is gridSize x gridSize, ranging from -gridSize/2 to +gridSize/2.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} canvasSize
 * @param {number} gridSize
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
 * @param {string} tileType
 * @returns {string} CSS color
 */
export function tileColor(tileType) {
  return TILE_COLORS[tileType] ?? '#A0B898';
}

/**
 * Get the color for a unit state.
 * @param {string} state
 * @returns {string} CSS color
 */
export function unitStateColor(state) {
  return UNIT_STATE_COLORS[state] ?? '#B0ACB0';
}

/**
 * Project an orthographic camera frustum onto the y=0 ground plane.
 * All inputs are plain objects -- no THREE dependency, fully testable.
 *
 * @param {{ x:number, y:number, z:number }} camPos  - camera world position
 * @param {{ x:number, y:number, z:number }} fwd     - camera forward (-Z axis in world space)
 * @param {{ x:number, y:number, z:number }} rt      - camera right (+X axis in world space)
 * @param {{ x:number, y:number, z:number }} up      - camera up (+Y axis in world space)
 * @param {number} fruLeft   - orthographic frustum left
 * @param {number} fruRight  - orthographic frustum right
 * @param {number} fruTop    - orthographic frustum top
 * @param {number} fruBottom - orthographic frustum bottom
 * @returns {{ x:number, z:number }[]} 4 ground-plane corners (BL, BR, TR, TL)
 */
export function projectViewportToGround(camPos, fwd, rt, up, fruLeft, fruRight, fruTop, fruBottom) {
  const corners = [];
  const frustumCorners = [
    [fruLeft, fruBottom],
    [fruRight, fruBottom],
    [fruRight, fruTop],
    [fruLeft, fruTop],
  ];

  for (const [fx, fy] of frustumCorners) {
    // Ray origin = camera position offset along right and up by frustum coords
    const ox = camPos.x + rt.x * fx + up.x * fy;
    const oy = camPos.y + rt.y * fx + up.y * fy;
    const oz = camPos.z + rt.z * fx + up.z * fy;

    // Ray direction is camera forward. Intersect y=0: oy + t * fwd.y = 0
    if (Math.abs(fwd.y) < 1e-6) continue;
    const t = -oy / fwd.y;

    corners.push({
      x: ox + t * fwd.x,
      z: oz + t * fwd.z,
    });
  }

  return corners;
}

// ---------------------------------------------------------------------------
// Minimap class
// ---------------------------------------------------------------------------

export class Minimap {
  /**
   * @param {object} terrain
   * @param {THREE.Camera} camera
   * @param {(worldX: number, worldZ: number) => void} onClickJump
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
    /** @type {HTMLCanvasElement|null} */
    this._worldCache = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._worldCacheCtx = null;

    this._onClick = this._onClick.bind(this);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  init() {
    this.container = document.createElement('div');
    this.container.className = 'minimap-container';

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasSize;
    this.canvas.height = this.canvasSize;
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    // Pre-render terrain
    this._renderTerrainCache();

    // World cache: terrain + buildings + units (updated per-poll)
    this._worldCache = document.createElement('canvas');
    this._worldCache.width = this.canvasSize;
    this._worldCache.height = this.canvasSize;
    this._worldCacheCtx = this._worldCache.getContext('2d');

    // Initialize world cache with terrain
    if (this.terrainCache) {
      this._worldCacheCtx.drawImage(this.terrainCache, 0, 0);
    }

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
    this._worldCache = null;
    this._worldCacheCtx = null;
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
  // Per-poll: update world cache (terrain + entities)
  // -----------------------------------------------------------------------

  /**
   * Redraw the world cache with current buildings and units.
   * Called each poll cycle (~2s).
   * @param {{ buildings: Map, units: Map }} worldManager
   */
  update(worldManager) {
    const ctx = this._worldCacheCtx;
    if (!ctx) return;

    // 1. Blit cached terrain
    if (this.terrainCache) {
      ctx.drawImage(this.terrainCache, 0, 0);
    }

    // 2. Buildings -- white 4x4 squares
    if (worldManager.buildings) {
      ctx.fillStyle = '#ffffff';
      for (const [, building] of worldManager.buildings) {
        const wx = building.position?.x ?? 0;
        const wz = building.position?.z ?? 0;
        const { px, py } = worldToMinimap(wx, wz, this.canvasSize, this.gridSize);
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }

    // 3. Units -- colored 2x2 dots (read position from mesh)
    if (worldManager.units) {
      for (const [, unit] of worldManager.units) {
        const wx = unit.mesh?.position?.x ?? 0;
        const wz = unit.mesh?.position?.z ?? 0;
        const state = unit.state ?? 'idle';
        ctx.fillStyle = unitStateColor(state);
        const { px, py } = worldToMinimap(wx, wz, this.canvasSize, this.gridSize);
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Per-frame: blit world cache + draw viewport polygon
  // -----------------------------------------------------------------------

  /**
   * Render the minimap: blit cached world layer then draw the viewport polygon.
   * Call every frame so the viewport tracks camera movement smoothly.
   */
  drawViewport() {
    const ctx = this.ctx;
    if (!ctx || !this.isVisible()) return;

    // Blit world cache
    if (this._worldCache) {
      ctx.drawImage(this._worldCache, 0, 0);
    }

    // Draw viewport polygon using ground-plane projection
    this._drawViewportPolygon(ctx);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  _renderTerrainCache() {
    this.terrainCache = document.createElement('canvas');
    this.terrainCache.width = this.canvasSize;
    this.terrainCache.height = this.canvasSize;
    const tctx = this.terrainCache.getContext('2d');

    const tileSize = this.canvasSize / this.gridSize;
    const half = this.gridSize / 2;

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
      tctx.fillStyle = tileColor('grass');
      tctx.fillRect(0, 0, this.canvasSize, this.canvasSize);
    }
  }

  /** Draw the camera viewport as a ground-projected polygon. */
  _drawViewportPolygon(ctx) {
    const cam = this.camera;
    if (!cam || !cam.matrixWorld) return;

    // Ensure matrices are fresh
    cam.updateMatrixWorld();

    // Extract camera basis vectors from matrixWorld columns
    const e = cam.matrixWorld.elements;
    const camPos = { x: e[12], y: e[13], z: e[14] };
    const rt     = { x: e[0],  y: e[1],  z: e[2] };
    const up     = { x: e[4],  y: e[5],  z: e[6] };
    const fwd    = { x: -e[8], y: -e[9], z: -e[10] }; // forward = -Z

    const corners = projectViewportToGround(
      camPos, fwd, rt, up,
      cam.left ?? -7, cam.right ?? 7, cam.top ?? 7, cam.bottom ?? -7,
    );

    if (corners.length < 3) return;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const first = worldToMinimap(corners[0].x, corners[0].z, this.canvasSize, this.gridSize);
    ctx.moveTo(first.px, first.py);
    for (let i = 1; i < corners.length; i++) {
      const p = worldToMinimap(corners[i].x, corners[i].z, this.canvasSize, this.gridSize);
      ctx.lineTo(p.px, p.py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  _onClick(e) {
    if (!this.canvas || !this.onClickJump) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { worldX, worldZ } = minimapToWorld(px, py, this.canvasSize, this.gridSize);
    this.onClickJump(worldX, worldZ);
  }
}
