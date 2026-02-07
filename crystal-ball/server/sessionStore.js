// server/sessionStore.js
// In-memory store that groups sessions by project and tracks state.
// Also tracks idle-economics metrics: cumulative awaiting agent-minutes
// and the longest current wait.

import { basename } from "node:path";

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

export class SessionStore {
  /** @type {import('./classifier.js').SessionClassifier} */
  #classifier;

  /** Latest snapshot returned by update() */
  #latest = { timestamp: null, sessions: [], groups: [], metrics: null };

  // ── Idle-economics tracking ───────────────────────────────────────────

  /** Previous state per PID (pid → state string from last poll) */
  #prevStates = new Map();

  /** Timestamp when each PID entered the awaiting state (pid → ms) */
  #awaitingStart = new Map();

  /** Cumulative milliseconds all sessions have spent in awaiting state */
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
   *
   * @param {Array<{
   *   pid: number,
   *   cwd: string,
   *   cpu: number,
   *   memMB: number,
   *   tty: string,
   *   hasChildren: boolean,
   *   startTime: number
   * }>} rawSessions
   * @returns {{ timestamp: string, sessions: object[], groups: object[], metrics: object }}
   */
  update(rawSessions) {
    const now = Date.now();
    const livePids = new Set();

    // ── 1. Record readings and classify ─────────────────────────────────
    const sessions = rawSessions.map((raw) => {
      livePids.add(raw.pid);
      this.#classifier.recordReading(raw.pid, raw.cpu);

      const state = this.#classifier.classify({
        pid: raw.pid,
        cpu: raw.cpu,
        tty: raw.tty,
        startTime: raw.startTime,
      });

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
      };
    });

    // ── 2. Cleanup stale PID history ────────────────────────────────────
    this.#classifier.cleanup(livePids);

    // ── 3. Update idle-economics tracking ───────────────────────────────
    this.#updateAwaitingMetrics(sessions, livePids, now);

    // ── 4. Build groups ─────────────────────────────────────────────────
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

    // ── 5. Build metrics ────────────────────────────────────────────────
    const metrics = this.#buildMetrics(sessions, now);

    // ── 6. Store & return ───────────────────────────────────────────────
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
   * Track state transitions into/out of awaiting and accumulate time.
   * @param {object[]} sessions – classified sessions from this poll
   * @param {Set<number>} livePids – PIDs still alive
   * @param {number} now – current timestamp in ms
   */
  #updateAwaitingMetrics(sessions, livePids, now) {
    // Accumulate time for sessions that were already awaiting since last poll
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

      if (currState === "awaiting" && prevState !== "awaiting") {
        // Entering awaiting state
        this.#awaitingStart.set(s.pid, now);
      } else if (currState !== "awaiting" && prevState === "awaiting") {
        // Leaving awaiting state — time already accumulated in per-poll sweep
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
   * @param {object[]} sessions – classified sessions
   * @param {number} now – current timestamp in ms
   * @returns {object}
   */
  #buildMetrics(sessions, now) {
    // Awaiting agent-minutes: convert total ms to minutes with 1 decimal
    const awaitingAgentMinutes =
      Math.round((this.#totalAwaitingMs / 60_000) * 10) / 10;

    // Longest current wait: find the session in awaiting with the earliest start
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

    return {
      awaitingAgentMinutes,
      longestWait,
    };
  }
}
