// server/classifier.js
// State heuristic engine — classifies a session into one of:
//   active  | awaiting | idle | stale
// based on CPU history, TTY attachment, and session age.

// ── Thresholds ──────────────────────────────────────────────────────────────
//   active  : CPU > 10 % sustained for > 3 s  (2+ consecutive readings at 2 s poll)
//   awaiting: CPU < 5 %, TTY attached, quiet 10–60 s
//   idle    : CPU < 5 %, alive, quiet > 10 min
//   stale   : TTY detached OR dormant > 30 min with zero CPU
// Priority order when checking: stale > active > awaiting > idle

const HISTORY_LENGTH = 10;             // readings to keep per PID
const ACTIVE_CPU_THRESHOLD = 10;       // %
const ACTIVE_MIN_CONSECUTIVE = 2;      // readings above threshold
const LOW_CPU_THRESHOLD = 5;           // %
const AWAITING_QUIET_MIN_MS = 10_000;  // 10 s
const AWAITING_QUIET_MAX_MS = 60_000;  // 60 s (beyond this, it's idle)
const IDLE_QUIET_MS = 600_000;         // 10 min
const STALE_DORMANT_MS = 1_800_000;    // 30 min

export class SessionClassifier {
  /** @type {Map<number, number[]>} pid → array of recent CPU readings */
  #history = new Map();

  /** Set of PIDs seen in the latest update cycle */
  #knownPids = new Set();

  // ── Record a new CPU reading ──────────────────────────────────────────
  /**
   * @param {number} pid
   * @param {number} cpuPercent
   */
  recordReading(pid, cpuPercent) {
    let readings = this.#history.get(pid);
    if (!readings) {
      readings = [];
      this.#history.set(pid, readings);
    }
    readings.push(cpuPercent);
    if (readings.length > HISTORY_LENGTH) {
      readings.shift();
    }
    this.#knownPids.add(pid);
  }

  // ── Classify a single session ─────────────────────────────────────────
  /**
   * @param {{ pid: number, cpu: number, tty: string, startTime: number, lastActivityTime?: number }} session
   * @returns {'active' | 'awaiting' | 'idle' | 'stale'}
   */
  classify(session) {
    const { pid, cpu, tty, startTime, lastActivityTime } = session;
    const now = Date.now();
    const readings = this.#history.get(pid) ?? [];
    const isDetached = !tty || tty === "detached";

    // Determine last-activity reference point.
    // If the caller provides lastActivityTime use it; otherwise approximate
    // from the most recent reading that was above LOW_CPU_THRESHOLD.
    let lastActive = lastActivityTime ?? startTime;
    if (!lastActivityTime && readings.length > 0) {
      // Walk backward through readings to find last above-threshold sample.
      // Each reading is ~2 s apart; use wall-clock estimate.
      for (let i = readings.length - 1; i >= 0; i--) {
        if (readings[i] >= LOW_CPU_THRESHOLD) {
          // Approximate: each reading is ~2 s, most-recent is index (length-1)
          const samplesAgo = readings.length - 1 - i;
          lastActive = now - samplesAgo * 2_000;
          break;
        }
      }
    }

    const quietDuration = now - lastActive;

    // ── 1. Stale ──────────────────────────────────────────────────────
    // TTY detached OR dormant > 30 min with zero CPU
    if (isDetached) return "stale";
    if (quietDuration >= STALE_DORMANT_MS && this.#allBelow(readings, 1)) {
      return "stale";
    }

    // ── 2. Active ─────────────────────────────────────────────────────
    // CPU > 10% sustained for 2+ consecutive most-recent readings
    if (this.#consecutiveTailAbove(readings, ACTIVE_CPU_THRESHOLD) >= ACTIVE_MIN_CONSECUTIVE) {
      return "active";
    }

    // ── 3. Awaiting ───────────────────────────────────────────────────
    // CPU < 5%, TTY attached, quiet 10–60 s
    if (
      cpu < LOW_CPU_THRESHOLD &&
      !isDetached &&
      quietDuration >= AWAITING_QUIET_MIN_MS &&
      quietDuration <= AWAITING_QUIET_MAX_MS
    ) {
      return "awaiting";
    }

    // ── 4. Idle (fallback) ────────────────────────────────────────────
    return "idle";
  }

  // ── Cleanup PIDs that no longer exist ─────────────────────────────────
  /**
   * @param {Set<number>|number[]} livePids – PIDs still present
   */
  cleanup(livePids) {
    const live = livePids instanceof Set ? livePids : new Set(livePids);
    for (const pid of this.#history.keys()) {
      if (!live.has(pid)) {
        this.#history.delete(pid);
      }
    }
    this.#knownPids = live;
  }

  // ── Private helpers ───────────────────────────────────────────────────
  /** Count how many of the most-recent consecutive readings are above `threshold`. */
  #consecutiveTailAbove(readings, threshold) {
    let count = 0;
    for (let i = readings.length - 1; i >= 0; i--) {
      if (readings[i] > threshold) count++;
      else break;
    }
    return count;
  }

  /** True if every reading in the array is below `threshold` (or array is empty). */
  #allBelow(readings, threshold) {
    return readings.every((r) => r < threshold);
  }
}
