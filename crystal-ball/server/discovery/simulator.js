// server/discovery/simulator.js
// Fake session generator for dev/demo mode.
// Produces realistic, time-varying data with smooth CPU curves,
// state transitions, session churn, and deterministic age spread.
// Supports Mode 2: ~60% of sessions get sidecar context with phase cycling.

// ── Simulated project groups ────────────────────────────────────────────────
const SIMULATED_GROUPS = [
  { name: "SimExLab", cwd: "/home/tomek/projects/SimExLab", baseSessionCount: 4 },
  { name: "FPA-328", cwd: "/home/tomek/projects/FPA-328", baseSessionCount: 2 },
  { name: "INCIDENT-18071", cwd: "/home/tomek/projects/INCIDENT-18071", baseSessionCount: 1 },
  { name: "DOTFILES", cwd: "/home/tomek/projects/DOTFILES", baseSessionCount: 3 },
  { name: "Q1TouchPoint", cwd: "/home/tomek/projects/Q1TouchPoint", baseSessionCount: 2 },
];

// ── Mode 2: Simulated tasks with phase cycles ──────────────────────────────
const SIMULATED_TASKS = [
  { task: 'Implement user authentication', phases: ['planning', 'researching', 'coding', 'testing', 'debugging', 'coding', 'testing', 'reviewing'] },
  { task: 'Fix database connection pooling', phases: ['debugging', 'researching', 'coding', 'testing', 'coding', 'testing', 'reviewing'] },
  { task: 'Add API rate limiting', phases: ['planning', 'coding', 'testing', 'documenting'] },
  { task: 'Refactor payment processing', phases: ['researching', 'planning', 'coding', 'coding', 'testing', 'debugging', 'testing', 'reviewing'] },
  { task: 'Migrate to TypeScript', phases: ['planning', 'coding', 'coding', 'coding', 'testing', 'debugging'] },
  { task: 'Set up CI/CD pipeline', phases: ['researching', 'coding', 'testing', 'documenting'] },
  { task: 'Optimize search queries', phases: ['researching', 'debugging', 'coding', 'testing', 'reviewing'] },
  { task: 'Build notification system', phases: ['planning', 'researching', 'coding', 'testing', 'coding', 'testing', 'reviewing', 'documenting'] },
  { task: 'Update dependency versions', phases: ['researching', 'coding', 'testing', 'debugging', 'testing'] },
  { task: 'Add accessibility features', phases: ['researching', 'planning', 'coding', 'testing', 'reviewing'] },
];

const PHASE_DETAILS = {
  planning:     ['Drafting architecture', 'Writing design doc', 'Analyzing requirements', 'Mapping dependencies'],
  researching:  ['Reading documentation', 'Exploring codebase', 'Searching for patterns', 'Reviewing prior art'],
  coding:       ['Writing implementation', 'Building components', 'Editing source files', 'Adding new module'],
  testing:      ['Running test suite', 'Writing unit tests', 'Checking edge cases', 'Validating integration'],
  debugging:    ['Investigating failure', 'Tracing stack trace', 'Isolating root cause', 'Checking logs'],
  reviewing:    ['Reviewing diff', 'Checking code style', 'Validating changes', 'Running linter'],
  documenting:  ['Writing docs', 'Updating README', 'Adding JSDoc comments', 'Writing changelog'],
  idle:         ['Waiting for input', 'Session idle'],
};

// ── Behavior definitions ────────────────────────────────────────────────────
// Each behavior drives CPU shape via a sine-wave curve or flat value.
const BEHAVIORS = {
  active:   { baseMin: 20, baseMax: 80, period: 12_000, spikeChance: 0.03 },
  awaiting: { baseMin: 0,  baseMax: 4,  period: 30_000, spikeChance: 0 },
  idle:     { baseMin: 0,  baseMax: 2,  period: 60_000, spikeChance: 0 },
  burst:    { baseMin: 40, baseMax: 95, period: 6_000,  spikeChance: 0.08 },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
let nextPid = 100_000;
function freshPid() {
  return nextPid++;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute smooth CPU% for a session at a given wall-clock time.
 * Uses a sine wave modulated by the session's phase offset and behavior params,
 * with occasional spikes layered on top.
 */
function cpuForSession(session, now) {
  const b = BEHAVIORS[session.behavior] ?? BEHAVIORS.idle;
  const elapsed = now - session._createdAt;
  const angle = ((elapsed + session._phaseOffset) / b.period) * Math.PI * 2;
  const sine = (Math.sin(angle) + 1) / 2; // 0..1
  let cpu = b.baseMin + sine * (b.baseMax - b.baseMin);

  // Occasional spike
  if (b.spikeChance > 0 && Math.random() < b.spikeChance) {
    cpu += 15 + Math.random() * 20;
  }

  return clamp(Math.round(cpu * 10) / 10, 0, 100);
}

// ── Age presets (ms before "now" at init time) ──────────────────────────────
const AGE_PRESETS_MS = [
  30_000,          // 30 s  - very young
  120_000,         // 2 min - young
  300_000,         // 5 min
  600_000,         // 10 min
  1_200_000,       // 20 min
  1_800_000,       // 30 min
  3_600_000,       // 1 h
  5_400_000,       // 1.5 h
  7_200_000,       // 2 h
  9_000_000,       // 2.5 h
  10_800_000,      // 3 h
];

// ── TTY pool ────────────────────────────────────────────────────────────────
function assignTty(index) {
  // ~15 % chance of "detached", rest get pts
  if (index % 7 === 0) return "detached";
  return `/dev/pts/${index % 12}`;
}

// ── SimulatorDiscovery ──────────────────────────────────────────────────────
export class SimulatorDiscovery {
  /** @type {Map<number, object>} pid -> session internal record */
  #sessions = new Map();

  /** Epoch ms when the simulator was constructed */
  #epoch;

  /** Counter for scheduling state transitions */
  #lastTransitionAt;

  /** Counter for scheduling churn */
  #lastChurnAt;

  constructor() {
    this.#epoch = Date.now();
    this.#lastTransitionAt = this.#epoch;
    this.#lastChurnAt = this.#epoch;
    this.#initializeSessions();
  }

  // ── Bootstrap sessions with deterministic spread ────────────────────────
  #initializeSessions() {
    const now = Date.now();
    let ageIndex = 0;

    for (const group of SIMULATED_GROUPS) {
      for (let i = 0; i < group.baseSessionCount; i++) {
        const age = AGE_PRESETS_MS[ageIndex % AGE_PRESETS_MS.length];
        ageIndex++;

        const pid = freshPid();
        const behaviorPool = i === 0 ? ["active", "burst"] : ["active", "awaiting", "idle"];
        const behavior = pickRandom(behaviorPool);

        // ~60% of sessions are Mode 2
        const isMode2 = Math.random() < 0.6;

        const session = {
          pid,
          cwd: group.cwd,
          tty: assignTty(ageIndex),
          hasChildren: Math.random() < 0.3,
          startTime: now - age,
          behavior,
          memMB: 40 + Math.floor(Math.random() * 160),
          _phaseOffset: Math.random() * 60_000,
          _createdAt: now - age,
          // Mode 2 fields
          _taskDef: isMode2 ? pickRandom(SIMULATED_TASKS) : null,
          _phaseIdx: isMode2 ? Math.floor(Math.random() * 4) : 0,
          _phaseStartedAt: now,
          _blockedUntil: 0,
        };

        this.#sessions.set(pid, session);
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────
  async discoverSessions() {
    const now = Date.now();

    // 1. State transition - roughly every 30-60 s one session changes behavior
    if (now - this.#lastTransitionAt > 30_000 + Math.random() * 30_000) {
      this.#performStateTransition();
      this.#lastTransitionAt = now;
    }

    // 2. Session churn - every 2-3 min, kill one session and spawn a new one
    if (now - this.#lastChurnAt > 120_000 + Math.random() * 60_000) {
      this.#performChurn(now);
      this.#lastChurnAt = now;
    }

    // 3. Toggle has_children occasionally for active sessions
    for (const s of this.#sessions.values()) {
      if ((s.behavior === "active" || s.behavior === "burst") && Math.random() < 0.01) {
        s.hasChildren = !s.hasChildren;
      }
    }

    // 4. Update Mode 2 phase cycling
    this.#updatePhaseCycles(now);

    // 5. Build raw output
    return [...this.#sessions.values()].map((s) => {
      const output = {
        pid: s.pid,
        cwd: s.cwd,
        cpu: cpuForSession(s, now),
        memMB: s.memMB + Math.round((Math.random() - 0.5) * 4),
        tty: s.tty,
        hasChildren: s.hasChildren,
        startTime: s.startTime,
      };

      // Attach sidecar for Mode 2 sessions
      if (s._taskDef) {
        const phases = s._taskDef.phases;
        const phase = phases[s._phaseIdx % phases.length];
        const blocked = now < s._blockedUntil;
        const detailOptions = PHASE_DETAILS[phase] || ['Working'];
        const detail = detailOptions[s._phaseIdx % detailOptions.length];

        output.sidecar = {
          task: s._taskDef.task,
          phase,
          blocked,
          detail: blocked ? 'Waiting for user input' : detail,
          stale: false,
        };
      }

      return output;
    });
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  /** Cycle Mode 2 sessions through phases on a 20-40s timer */
  #updatePhaseCycles(now) {
    for (const s of this.#sessions.values()) {
      if (!s._taskDef) continue;

      const elapsed = now - s._phaseStartedAt;
      const phaseDuration = 20_000 + Math.random() * 20_000; // 20-40s

      if (elapsed > phaseDuration) {
        s._phaseIdx = (s._phaseIdx + 1) % s._taskDef.phases.length;
        s._phaseStartedAt = now;

        // ~10% chance of entering blocked state for 15-30s
        if (Math.random() < 0.10) {
          s._blockedUntil = now + 15_000 + Math.random() * 15_000;
        }
      }
    }
  }

  #performStateTransition() {
    const all = [...this.#sessions.values()];
    const target = pickRandom(all);
    if (!target) return;

    const transitions = {
      active:   ["awaiting", "idle"],
      burst:    ["active", "awaiting"],
      awaiting: ["active", "idle"],
      idle:     ["awaiting", "active"],
    };

    const options = transitions[target.behavior] ?? ["idle"];
    target.behavior = pickRandom(options);
    // Reset phase so the new curve starts cleanly
    target._phaseOffset = Math.random() * 60_000;
    target._createdAt = Date.now();
  }

  #performChurn(now) {
    // Remove a random session
    const pids = [...this.#sessions.keys()];
    if (pids.length <= 3) return; // keep minimum population
    const removePid = pickRandom(pids);
    const removed = this.#sessions.get(removePid);
    this.#sessions.delete(removePid);

    // Add a replacement in the same group
    const pid = freshPid();
    const isMode2 = Math.random() < 0.6;

    this.#sessions.set(pid, {
      pid,
      cwd: removed.cwd,
      tty: assignTty(pid % 20),
      hasChildren: false,
      startTime: now,
      behavior: pickRandom(["active", "awaiting"]),
      memMB: 40 + Math.floor(Math.random() * 160),
      _phaseOffset: Math.random() * 60_000,
      _createdAt: now,
      _taskDef: isMode2 ? pickRandom(SIMULATED_TASKS) : null,
      _phaseIdx: 0,
      _phaseStartedAt: now,
      _blockedUntil: 0,
    });
  }
}
