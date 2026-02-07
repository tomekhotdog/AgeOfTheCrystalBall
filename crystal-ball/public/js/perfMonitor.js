// perfMonitor.js — Per-frame performance instrumentation overlay.
// Toggle with P key. Shows FPS, frame-time breakdown per system,
// draw calls, triangle count, and jank detection.

// ---------------------------------------------------------------------------
// Pure helpers (testable without DOM)
// ---------------------------------------------------------------------------

/**
 * Compute rolling statistics from a circular buffer of numbers.
 * @param {number[]} buf
 * @param {number} count — how many entries are valid
 * @returns {{ avg: number, min: number, max: number, p95: number }}
 */
export function rollingStats(buf, count) {
  if (count === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
  const n = Math.min(count, buf.length);
  let sum = 0, min = Infinity, max = -Infinity;
  const sorted = [];
  for (let i = 0; i < n; i++) {
    const v = buf[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    sorted.push(v);
  }
  sorted.sort((a, b) => a - b);
  const p95idx = Math.min(Math.floor(n * 0.95), n - 1);
  return { avg: sum / n, min, max, p95: sorted[p95idx] };
}

/**
 * Format milliseconds for display.
 * @param {number} ms
 * @returns {string}
 */
export function fmtMs(ms) {
  if (ms < 0.1) return '0.0';
  if (ms < 10) return ms.toFixed(1);
  return ms.toFixed(0);
}

/**
 * Build a tiny ASCII bar proportional to value within budget.
 * @param {number} ms — value
 * @param {number} budget — total frame budget (e.g. 16.67)
 * @param {number} width — max bar chars
 * @returns {string}
 */
export function microBar(ms, budget, width = 20) {
  const fill = Math.min(width, Math.round((ms / budget) * width));
  return '\u2588'.repeat(fill) + '\u2591'.repeat(width - fill);
}

/** Round to 2 decimal places. */
function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Format a snapshot object as human-readable text for pasting.
 * @param {object} s — snapshot from PerfMonitor.snapshot()
 * @returns {string}
 */
export function formatSnapshot(s) {
  const lines = [
    `=== Crystal Ball Perf Snapshot (${s.ts}) ===`,
    `FPS: ${s.fps}  |  Wall: avg ${s.wall.avg}ms  p95 ${s.wall.p95}ms  max ${s.wall.max}ms`,
    `JS work: avg ${s.jsWork.avg}ms  p95 ${s.jsWork.p95}ms  max ${s.jsWork.max}ms`,
    `GPU wait: ${s.gpuWait}ms`,
    `--- Segments (avg / p95 ms) ---`,
  ];
  for (const [label, v] of Object.entries(s.segments)) {
    lines.push(`  ${label.padEnd(14)} ${String(v.avg).padStart(6)}  / ${String(v.p95).padStart(6)}`);
  }
  if (s.gpu) {
    lines.push(`--- GPU ---`);
    lines.push(`  Draw calls: ${s.gpu.drawCalls}  Triangles: ${s.gpu.triangles}  Geometries: ${s.gpu.geometries}  Textures: ${s.gpu.textures}`);
  }
  lines.push(`--- Jank (wall >${JANK_THRESHOLD}ms) ---`);
  lines.push(`  ${s.jank.count}/${s.jank.total} frames (${s.jank.pct}%)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Circular buffer helper
// ---------------------------------------------------------------------------

class CircularBuffer {
  constructor(capacity) {
    this.buf = new Float64Array(capacity);
    this.head = 0;
    this.count = 0;
    this.capacity = capacity;
  }
  push(v) {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }
  /** Return array of the last `count` entries (oldest first). */
  toArray() {
    const n = this.count;
    const out = new Array(n);
    const start = (this.head - n + this.capacity) % this.capacity;
    for (let i = 0; i < n; i++) {
      out[i] = this.buf[(start + i) % this.capacity];
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// PerfMonitor class
// ---------------------------------------------------------------------------

const WINDOW = 120;        // rolling window (frames)
const DISPLAY_HZ = 4;      // update display N times per second
const JANK_THRESHOLD = 33;  // ms — frames above this are "jank" (< 30 fps)

export class PerfMonitor {
  /**
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(renderer) {
    this._renderer = renderer;

    // Frame-level timing
    this._frameIntervals = new CircularBuffer(WINDOW);
    this._frameDurations = new CircularBuffer(WINDOW);
    this._lastFrameStart = 0;
    this._frameStart = 0;

    // Per-segment timing (ordered map: label -> CircularBuffer)
    this._segments = new Map();
    this._segmentOrder = [];
    this._currentSegStart = 0;
    this._currentSegLabel = '';

    // Jank tracking
    this._jankCount = 0;
    this._totalFrames = 0;

    // Display
    this._visible = false;
    this._el = null;
    this._lastDisplayUpdate = 0;
    this._lastServerPost = 0;

    this._createOverlay();
  }

  // -----------------------------------------------------------------------
  // Public API — call from animate loop
  // -----------------------------------------------------------------------

  /** Mark the start of a new frame. Call at the very top of animate(). */
  beginFrame() {
    const now = performance.now();
    if (this._lastFrameStart > 0) {
      const interval = now - this._lastFrameStart;
      this._frameIntervals.push(interval);
      // Jank is based on wall time (frame interval), not JS work duration
      if (interval > JANK_THRESHOLD) this._jankCount++;
    }
    this._lastFrameStart = now;
    this._frameStart = now;
    this._currentSegLabel = '';
    this._totalFrames++;
  }

  /**
   * Mark the boundary between two timed segments.
   * The first call starts timing 'label'; subsequent calls end the previous
   * segment and start a new one.
   * @param {string} label
   */
  mark(label) {
    const now = performance.now();
    // End previous segment
    if (this._currentSegLabel) {
      this._pushSegment(this._currentSegLabel, now - this._currentSegStart);
    }
    this._currentSegLabel = label;
    this._currentSegStart = now;
  }

  /** Mark the end of the frame. Call after the last render. */
  endFrame() {
    const now = performance.now();
    // End last segment
    if (this._currentSegLabel) {
      this._pushSegment(this._currentSegLabel, now - this._currentSegStart);
      this._currentSegLabel = '';
    }
    const duration = now - this._frameStart;
    this._frameDurations.push(duration);

    // Update display at DISPLAY_HZ
    if (this._visible && now - this._lastDisplayUpdate > 1000 / DISPLAY_HZ) {
      this._updateOverlay();
      this._lastDisplayUpdate = now;
    }

    // POST snapshot to server every 5 seconds
    if (now - this._lastServerPost > 5000) {
      this.postToServer();
      this._lastServerPost = now;
    }
  }

  /** Toggle overlay visibility. */
  toggle() {
    this._visible = !this._visible;
    if (this._el) this._el.style.display = this._visible ? 'block' : 'none';
  }

  /**
   * Return a structured snapshot of current performance data.
   * @returns {object}
   */
  snapshot() {
    const intervalStats = rollingStats(
      this._frameIntervals.toArray(), this._frameIntervals.count
    );
    const durationStats = rollingStats(
      this._frameDurations.toArray(), this._frameDurations.count
    );

    const fps = intervalStats.avg > 0 ? 1000 / intervalStats.avg : 0;
    const wallAvg = intervalStats.avg;
    const gpuWait = Math.max(0, wallAvg - durationStats.avg);

    const segments = {};
    for (const label of this._segmentOrder) {
      const buf = this._segments.get(label);
      const s = rollingStats(buf.toArray(), buf.count);
      segments[label] = { avg: round2(s.avg), p95: round2(s.p95) };
    }

    const info = this._renderer?.info;
    const gpu = info ? {
      drawCalls: info.render?.calls ?? 0,
      triangles: info.render?.triangles ?? 0,
      geometries: info.memory?.geometries ?? 0,
      textures: info.memory?.textures ?? 0,
    } : null;

    return {
      ts: new Date().toISOString(),
      fps: round2(fps),
      wall: { avg: round2(wallAvg), p95: round2(intervalStats.p95), max: round2(intervalStats.max) },
      jsWork: { avg: round2(durationStats.avg), p95: round2(durationStats.p95), max: round2(durationStats.max) },
      gpuWait: round2(gpuWait),
      segments,
      gpu,
      jank: { count: this._jankCount, total: this._totalFrames, pct: round2(this._totalFrames > 0 ? (this._jankCount / this._totalFrames) * 100 : 0) },
    };
  }

  /** Copy a human-readable snapshot to clipboard. Returns the text. */
  async copySnapshot() {
    const s = this.snapshot();
    const text = formatSnapshot(s);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(text); } catch (_) { /* noop */ }
    }
    this._flashCopied();
    return text;
  }

  /** POST current snapshot to /api/perf for autonomous monitoring. */
  postToServer() {
    const data = this.snapshot();
    if (typeof fetch !== 'undefined') {
      fetch('/api/perf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => {});
    }
  }

  _flashCopied() {
    if (!this._el) return;
    const prev = this._el.style.borderColor;
    this._el.style.borderColor = 'rgba(74,232,100,0.8)';
    this._el.style.display = 'block';
    this._visible = true;
    setTimeout(() => { this._el.style.borderColor = prev; }, 600);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  _pushSegment(label, ms) {
    let buf = this._segments.get(label);
    if (!buf) {
      buf = new CircularBuffer(WINDOW);
      this._segments.set(label, buf);
      this._segmentOrder.push(label);
    }
    buf.push(ms);
  }

  _createOverlay() {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'perf-overlay';
    el.style.cssText = [
      'position:fixed', 'top:48px', 'left:12px',
      'background:rgba(10,10,20,0.92)', 'color:#c8c8c8',
      'font:11px/1.5 "IBM Plex Mono",monospace',
      'padding:10px 14px', 'border-radius:6px',
      'border:1px solid rgba(232,200,74,0.3)',
      'z-index:500', 'pointer-events:none',
      'white-space:pre', 'display:none',
      'min-width:320px',
    ].join(';');
    document.body.appendChild(el);
    this._el = el;
  }

  _updateOverlay() {
    if (!this._el) return;

    const intervalStats = rollingStats(
      this._frameIntervals.toArray(), this._frameIntervals.count
    );
    const durationStats = rollingStats(
      this._frameDurations.toArray(), this._frameDurations.count
    );

    const fps = intervalStats.avg > 0 ? 1000 / intervalStats.avg : 0;
    const fpsMin = intervalStats.max > 0 ? 1000 / intervalStats.max : 0;
    const wallAvg = intervalStats.avg;  // true frame-to-frame time
    const budget = 16.67; // 60 fps target

    // Header — two rows: wall time (what determines FPS) and JS time
    const lines = [];
    lines.push(
      `FPS: ${fps.toFixed(0)} (min ${fpsMin.toFixed(0)})  ` +
      `Wall: ${fmtMs(wallAvg)}ms (p95 ${fmtMs(intervalStats.p95)}ms)`
    );
    lines.push(
      `JS work: ${fmtMs(durationStats.avg)}ms (p95 ${fmtMs(durationStats.p95)}ms)  ` +
      `GPU wait: ${fmtMs(Math.max(0, wallAvg - durationStats.avg))}ms`
    );
    lines.push('\u2500'.repeat(48));

    // Per-segment breakdown (bars proportional to WALL time, not JS budget)
    const barBudget = wallAvg > 0 ? wallAvg : budget;
    for (const label of this._segmentOrder) {
      const buf = this._segments.get(label);
      const stats = rollingStats(buf.toArray(), buf.count);
      const bar = microBar(stats.avg, barBudget, 16);
      const padLabel = label.padEnd(12);
      lines.push(`${padLabel}${fmtMs(stats.avg).padStart(5)}ms ${bar}`);
    }

    // Show GPU wait as its own bar
    const gpuWait = Math.max(0, wallAvg - durationStats.avg);
    if (gpuWait > 0.5) {
      const bar = microBar(gpuWait, barBudget, 16);
      lines.push(`${'GPU wait'.padEnd(12)}${fmtMs(gpuWait).padStart(5)}ms ${bar}`);
    }

    // Renderer info
    const info = this._renderer?.info;
    if (info) {
      lines.push('\u2500'.repeat(48));
      const calls = info.render?.calls ?? 0;
      const tris = info.render?.triangles ?? 0;
      const geoms = info.memory?.geometries ?? 0;
      const texs = info.memory?.textures ?? 0;
      lines.push(
        `Draw calls: ${calls}  Tris: ${(tris / 1000).toFixed(1)}K`
      );
      lines.push(
        `Geometries: ${geoms}  Textures: ${texs}`
      );
    }

    // Jank summary (based on wall time, not JS time)
    lines.push('\u2500'.repeat(48));
    const jankPct = this._totalFrames > 0
      ? ((this._jankCount / this._totalFrames) * 100).toFixed(1)
      : '0.0';
    lines.push(
      `Jank (wall >${JANK_THRESHOLD}ms): ${this._jankCount}/${this._totalFrames} (${jankPct}%)`
    );

    this._el.textContent = lines.join('\n');
  }
}

export default PerfMonitor;
