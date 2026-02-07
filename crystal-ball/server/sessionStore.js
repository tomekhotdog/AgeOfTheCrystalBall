// server/sessionStore.js
// In-memory store that groups sessions by project and tracks state.
// Also tracks idle-economics metrics: cumulative awaiting agent-minutes
// and the longest current wait.
// Supports Mode 2 sidecar context via .crystal-ball.json files.

import { basename } from "node:path";
import { readAllSidecars } from "./discovery/sidecar.js";

const NAMES = [
  'Aldric', 'Bronwyn', 'Cedric', 'Daphne', 'Edric',
  'Freya', 'Gareth', 'Helena', 'Isolde', 'Jasper',
  'Kiera', 'Leoric', 'Maren', 'Nolan', 'Orin',
  'Petra', 'Quinn', 'Rowan', 'Sable', 'Theron',
  'Una', 'Valen', 'Wren', 'Xara', 'Yorick', 'Zara',
  'Alaric', 'Brigid', 'Corin', 'Dagny', 'Elara',
  'Finn', 'Gilda', 'Hector', 'Ingrid', 'Jorin',
  'Lyra', 'Magnus', 'Niamh', 'Oswin', 'Rosalind',
  'Silas', 'Tamsin', 'Ulric', 'Vivienne', 'Wulfric',
];

function nameFromPid(pid) {
  return NAMES[pid % NAMES.length];
}

/**
 * Resolve final state by combining OS-classified state with sidecar context.
 * Pure function, exported for testing.
 *
 * @param {string} osState - classifier-determined state
 * @param {object|null} sidecarContext - validated sidecar context or null
 * @returns {string} final state
 */
export function resolveState(osState, sidecarContext) {
  if (!sidecarContext) return osState;
  if (sidecarContext.blocked) return 'blocked';
  // Stale sidecar + idle/stale OS: OS wins (sidecar data too old to trust)
  if (sidecarContext.stale && (osState === 'idle' || osState === 'stale')) return osState;
  return osState;
}

export class SessionStore {
  /** @type {import('./classifier.js').SessionClassifier} */
  #classifier;

  /** Latest snapshot returned by update() */
  #latest = { timestamp: null, sessions: [], groups: [], metrics: null };

  // ── Idle-economics tracking ───────────────────────────────────────────

  /** Previous state per PID (pid -> state string from last poll) */
  #prevStates = new Map();

  /** Timestamp when each PID entered the awaiting/blocked state (pid -> ms) */
  #awaitingStart = new Map();

  /** Cumulative milliseconds all sessions have spent in awaiting/blocked state */
  #totalAwaitingMs = 0;

  /** Timestamp of the last poll (ms), used for incremental accumulation */
  #lastPollTime = 0;

  /**
   * @param {import('./classifier.js').SessionClassifier} classifier
   */
  constructor(classifier) {
    this.#classifier = classifier;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Ingest raw sessions from discovery, classify, group, and store.
   * Now async: reads sidecar files for Mode 2 context.
   *
   * @param {Array<{
   *   pid: number,
   *   cwd: string,
   *   cpu: number,
   *   memMB: number,
   *   tty: string,
   *   hasChildren: boolean,
   *   startTime: number,
   *   sidecar?: object
   * }>} rawSessions
   * @returns {Promise<{ timestamp: string, sessions: object[], groups: object[], metrics: object }>}
   */
  async update(rawSessions) {
    const now = Date.now();
    const livePids = new Set();

    // ── 1. Read sidecars (inline from simulator, or from filesystem) ───
    const sidecarMap = new Map();

    // Collect inline sidecars from simulator
    const needsFileRead = [];
    for (const raw of rawSessions) {
      if (raw.sidecar) {
        sidecarMap.set(raw.pid, raw.sidecar);
      } else {
        needsFileRead.push({ pid: raw.pid, cwd: raw.cwd });
      }
    }

    // Batch-read all filesystem sidecars from the central directory
    if (needsFileRead.length > 0) {
      const fileSidecars = await readAllSidecars(needsFileRead);
      for (const [pid, ctx] of fileSidecars) {
        sidecarMap.set(pid, ctx);
      }
    }

    // ── 2. Record readings and classify ─────────────────────────────────
    const sessions = rawSessions.map((raw) => {
      livePids.add(raw.pid);
      this.#classifier.recordReading(raw.pid, raw.cpu);

      const osState = this.#classifier.classify({
        pid: raw.pid,
        cpu: raw.cpu,
        tty: raw.tty,
        startTime: raw.startTime,
      });

      const sidecarContext = sidecarMap.get(raw.pid) || null;
      const state = resolveState(osState, sidecarContext);

      const groupName = basename(raw.cwd);

      return {
        id: `claude-${raw.pid}`,
        pid: raw.pid,
        cwd: raw.cwd,
        cpu: raw.cpu,
        mem: raw.memMB,
        state,
        age_seconds: Math.round((now - raw.startTime) / 1_000),
        tty: raw.tty,
        has_children: raw.hasChildren,
        group: groupName,
        mode: sidecarContext ? 2 : 1,
        context: sidecarContext,
      };
    });

    // ── 3. Cleanup stale PID history ────────────────────────────────────
    this.#classifier.cleanup(livePids);

    // ── 4. Update idle-economics tracking ───────────────────────────────
    this.#updateAwaitingMetrics(sessions, livePids, now);

    // ── 5. Build groups ─────────────────────────────────────────────────
    /** @type {Map<string, { cwd: string, sessionIds: string[] }>} */
    const groupMap = new Map();

    for (const s of sessions) {
      let g = groupMap.get(s.group);
      if (!g) {
        g = { cwd: s.cwd, sessionIds: [] };
        groupMap.set(s.group, g);
      }
      g.sessionIds.push(s.id);
    }

    const groups = [...groupMap.entries()].map(([name, g]) => ({
      id: name,
      cwd: g.cwd,
      session_count: g.sessionIds.length,
      session_ids: g.sessionIds,
    }));

    // ── 6. Build metrics ────────────────────────────────────────────────
    const metrics = this.#buildMetrics(sessions, now);

    // ── 7. Store & return ───────────────────────────────────────────────
    this.#latest = {
      timestamp: new Date(now).toISOString(),
      sessions,
      groups,
      metrics,
    };

    return this.#latest;
  }

  /**
   * Return the most recent snapshot (useful between polling cycles).
   */
  getLatest() {
    return this.#latest;
  }

  // ── Private: idle-economics helpers ─────────────────────────────────────

  /**
   * Track state transitions into/out of awaiting/blocked and accumulate time.
   * 'blocked' is treated like 'awaiting' for idle-economics accumulation.
   * @param {object[]} sessions - classified sessions from this poll
   * @param {Set<number>} livePids - PIDs still alive
   * @param {number} now - current timestamp in ms
   */
  #updateAwaitingMetrics(sessions, livePids, now) {
    const isWaiting = (state) => state === 'awaiting' || state === 'blocked';

    // Accumulate time for sessions that were already awaiting/blocked since last poll
    if (this.#lastPollTime > 0) {
      const elapsed = now - this.#lastPollTime;
      for (const pid of this.#awaitingStart.keys()) {
        // Only accumulate if the PID is still alive
        if (livePids.has(pid)) {
          this.#totalAwaitingMs += elapsed;
        }
      }
    }

    // Build a lookup of current states by PID
    const currentStates = new Map();
    for (const s of sessions) {
      currentStates.set(s.pid, s.state);
    }

    // Detect state transitions
    for (const s of sessions) {
      const prevState = this.#prevStates.get(s.pid);
      const currState = s.state;

      if (isWaiting(currState) && !isWaiting(prevState)) {
        // Entering awaiting/blocked state
        this.#awaitingStart.set(s.pid, now);
      } else if (!isWaiting(currState) && isWaiting(prevState)) {
        // Leaving awaiting/blocked state
        this.#awaitingStart.delete(s.pid);
      }
    }

    // Cleanup: remove dead PIDs from tracking maps
    for (const pid of this.#awaitingStart.keys()) {
      if (!livePids.has(pid)) {
        this.#awaitingStart.delete(pid);
      }
    }
    for (const pid of this.#prevStates.keys()) {
      if (!livePids.has(pid)) {
        this.#prevStates.delete(pid);
      }
    }

    // Update previous states for next poll cycle
    for (const s of sessions) {
      this.#prevStates.set(s.pid, s.state);
    }

    // Update last poll time
    this.#lastPollTime = now;
  }

  /**
   * Build the metrics object for the API response.
   * @param {object[]} sessions - classified sessions
   * @param {number} now - current timestamp in ms
   * @returns {object}
   */
  #buildMetrics(sessions, now) {
    // Awaiting agent-minutes: convert total ms to minutes with 1 decimal
    const awaitingAgentMinutes =
      Math.round((this.#totalAwaitingMs / 60_000) * 10) / 10;

    // Longest current wait: find the session in awaiting/blocked with the earliest start
    let longestWait = null;
    let earliestStart = Infinity;

    for (const [pid, startTime] of this.#awaitingStart.entries()) {
      if (startTime < earliestStart) {
        earliestStart = startTime;
        // Find the matching session object
        const session = sessions.find((s) => s.pid === pid);
        if (session) {
          longestWait = {
            sessionId: session.id,
            name: nameFromPid(session.pid),
            group: session.group,
            seconds: Math.round((now - startTime) / 1_000),
          };
        }
      }
    }

    // Count blocked sessions
    let blockedCount = 0;
    for (const s of sessions) {
      if (s.state === 'blocked') blockedCount++;
    }

    return {
      awaitingAgentMinutes,
      longestWait,
      blockedCount,
    };
  }
}
