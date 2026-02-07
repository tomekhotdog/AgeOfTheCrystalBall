// tests/server/sessionStore.test.js
// Comprehensive tests for SessionStore idle-economics tracking.
// Tests the public API: update() → getLatest() to verify metrics.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../../server/sessionStore.js';
import { SessionClassifier } from '../../server/classifier.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a raw session object for feeding into store.update().
 * The classifier needs specific CPU / TTY / age combos to produce
 * the desired state.  We use these shortcuts:
 *
 *   makeAwaiting(pid, cwd) → low CPU, TTY attached, ~15 s old → "awaiting"
 *   makeActive(pid, cwd)   → high CPU, TTY attached, recent   → "active"
 *   makeIdle(pid, cwd)     → low CPU, TTY attached, old       → "idle"
 */

function makeSession(pid, cwd, cpu, tty, ageMs) {
  return {
    pid,
    cwd,
    cpu,
    memMB: 100,
    tty: tty,
    hasChildren: false,
    startTime: Date.now() - ageMs,
  };
}

/**
 * Create a stub classifier that returns a predetermined state for each PID.
 * This gives us precise control over state transitions without depending
 * on the real classifier's heuristics.
 */
class StubClassifier {
  #stateMap = new Map();

  /** Set what state a PID should be classified as. */
  setState(pid, state) {
    this.#stateMap.set(pid, state);
  }

  recordReading(/* pid, cpu */) {
    // no-op for stub
  }

  classify({ pid }) {
    return this.#stateMap.get(pid) ?? 'idle';
  }

  cleanup(/* livePids */) {
    // no-op for stub
  }
}

// ── Stubbed Date.now for time control ───────────────────────────────────────

let fakeNow = 1_000_000;

/**
 * Monkey-patch Date.now() to return a controllable value.
 * Call restoreNow() to undo.
 */
function mockNow(ms) {
  fakeNow = ms;
  Date.now = () => fakeNow;
}

function advanceTime(ms) {
  fakeNow += ms;
  Date.now = () => fakeNow;
}

const originalNow = Date.now;
function restoreNow() {
  Date.now = originalNow;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SessionStore idle-economics metrics', () => {
  /** @type {StubClassifier} */
  let classifier;
  /** @type {SessionStore} */
  let store;

  beforeEach(() => {
    classifier = new StubClassifier();
    store = new SessionStore(classifier);
    mockNow(1_000_000); // reset time
  });

  // Clean up Date.now after all tests (belt and suspenders)
  // node:test doesn't have afterAll at top level, but beforeEach resets it.

  // ── Response shape ──────────────────────────────────────────────────────

  describe('API response shape', () => {
    it('should include metrics in the update() response', () => {
      const result = store.update([]);
      assert.ok(result.metrics, 'metrics should be present');
      assert.equal(typeof result.metrics.awaitingAgentMinutes, 'number');
      assert.equal(result.metrics.longestWait, null);
    });

    it('should include metrics in getLatest() response', () => {
      store.update([]);
      const result = store.getLatest();
      assert.ok(result.metrics, 'metrics should be present in getLatest()');
      assert.equal(typeof result.metrics.awaitingAgentMinutes, 'number');
    });

    it('longestWait should have correct shape when a session is awaiting', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      store.update(raw);
      const { metrics } = store.getLatest();

      assert.ok(metrics.longestWait, 'longestWait should not be null');
      assert.equal(metrics.longestWait.sessionId, 'claude-101');
      assert.equal(typeof metrics.longestWait.name, 'string');
      assert.equal(metrics.longestWait.group, 'alpha');
      assert.equal(typeof metrics.longestWait.seconds, 'number');
    });

    it('longestWait should be null when no sessions are awaiting', () => {
      classifier.setState(101, 'active');
      const raw = [makeSession(101, '/projects/alpha', 50, 'pts/0', 5_000)];

      store.update(raw);
      const { metrics } = store.getLatest();

      assert.equal(metrics.longestWait, null);
    });
  });

  // ── Cumulative awaiting minutes ─────────────────────────────────────────

  describe('awaitingAgentMinutes accumulation', () => {
    it('should start at 0', () => {
      const result = store.update([]);
      assert.equal(result.metrics.awaitingAgentMinutes, 0);
    });

    it('should accumulate time for sessions in awaiting state across polls', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: session enters awaiting (no time accumulated yet — first poll)
      store.update(raw);

      // Advance 60 seconds
      advanceTime(60_000);

      // Poll 2: session still awaiting → accumulates 60 s = 1.0 minute
      store.update(raw);
      const { metrics } = store.getLatest();

      assert.equal(metrics.awaitingAgentMinutes, 1.0);
    });

    it('should accumulate time for multiple awaiting sessions', () => {
      classifier.setState(101, 'awaiting');
      classifier.setState(102, 'awaiting');
      const raw = [
        makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000),
        makeSession(102, '/projects/beta', 2, 'pts/1', 20_000),
      ];

      // Poll 1: both enter awaiting
      store.update(raw);

      // Advance 30 seconds → 2 sessions * 30 s = 60 s = 1.0 minute
      advanceTime(30_000);

      store.update(raw);
      const { metrics } = store.getLatest();

      assert.equal(metrics.awaitingAgentMinutes, 1.0);
    });

    it('should keep accumulating across many poll cycles', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1
      store.update(raw);

      // 3 more polls, each 20 s apart → 3 * 20 s = 60 s = 1.0 min
      for (let i = 0; i < 3; i++) {
        advanceTime(20_000);
        store.update(raw);
      }

      const { metrics } = store.getLatest();
      assert.equal(metrics.awaitingAgentMinutes, 1.0);
    });

    it('should round to 1 decimal place', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      store.update(raw);

      // Advance 90 seconds → 1.5 minutes
      advanceTime(90_000);
      store.update(raw);

      const { metrics } = store.getLatest();
      assert.equal(metrics.awaitingAgentMinutes, 1.5);
    });
  });

  // ── State transitions ──────────────────────────────────────────────────

  describe('state transitions', () => {
    it('should stop accumulating when session leaves awaiting', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: enters awaiting
      store.update(raw);

      // Advance 60 s → 1.0 min
      advanceTime(60_000);
      store.update(raw);

      // Session becomes active
      classifier.setState(101, 'active');

      // Advance another 60 s
      advanceTime(60_000);
      store.update(raw);

      // Should still be 1.0 (the 60 s while active should not count)
      // Actually: at poll 3, the elapsed 60s is added for pid 101 (still in #awaitingStart
      // from poll 2), then transition out removes it. Let me reconsider.
      //
      // Flow:
      //   Poll 1 (t=0): enters awaiting → #awaitingStart.set(101, t0), #lastPollTime = t0
      //   Poll 2 (t=60s): elapsed=60s, pid 101 in awaitingStart → +60s. state still awaiting. #lastPollTime = t+60s
      //   Poll 3 (t=120s): elapsed=60s, pid 101 in awaitingStart → +60s. BUT then transition out → delete.
      //
      // So total = 120s = 2.0 min. That's correct because from poll 2 to poll 3 the
      // session was STILL in awaiting (we only discover the transition at poll 3).
      // The accumulation happens for the interval between polls, and the session was
      // awaiting during that interval.
      const { metrics } = store.getLatest();
      assert.equal(metrics.awaitingAgentMinutes, 2.0);
    });

    it('should re-accumulate when session re-enters awaiting', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: enters awaiting
      store.update(raw);

      // Advance 30 s
      advanceTime(30_000);
      store.update(raw); // +30 s

      // Leaves awaiting
      classifier.setState(101, 'active');
      advanceTime(30_000);
      store.update(raw); // +30 s (still counted — see note above)

      // Now in active state for a poll cycle (no accumulation from this period on)
      advanceTime(30_000);
      store.update(raw); // +0 s (not in awaitingStart anymore)

      // Re-enters awaiting
      classifier.setState(101, 'awaiting');
      advanceTime(30_000);
      store.update(raw); // +0 s (just re-entered, awaitingStart not set until transition detected)

      // Wait another 30 s
      advanceTime(30_000);
      store.update(raw); // +30 s

      const { metrics } = store.getLatest();
      // Total: 30 + 30 + 0 + 0 + 30 = 90 s = 1.5 min
      assert.equal(metrics.awaitingAgentMinutes, 1.5);
    });

    it('should not accumulate for sessions that were never awaiting', () => {
      classifier.setState(101, 'active');
      const raw = [makeSession(101, '/projects/alpha', 50, 'pts/0', 5_000)];

      store.update(raw);
      advanceTime(120_000);
      store.update(raw);

      const { metrics } = store.getLatest();
      assert.equal(metrics.awaitingAgentMinutes, 0);
    });
  });

  // ── Longest current wait ──────────────────────────────────────────────

  describe('longestWait calculation', () => {
    it('should report the session with the earliest awaiting start', () => {
      classifier.setState(101, 'awaiting');
      const raw1 = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: session 101 enters awaiting at t=1_000_000
      store.update(raw1);

      // Advance 10 s, add session 102 also awaiting
      advanceTime(10_000);
      classifier.setState(102, 'awaiting');
      const raw2 = [
        makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000),
        makeSession(102, '/projects/beta', 2, 'pts/1', 20_000),
      ];
      store.update(raw2);

      // Advance 5 s for final check
      advanceTime(5_000);
      store.update(raw2);

      const { metrics } = store.getLatest();
      assert.ok(metrics.longestWait);
      // Session 101 entered awaiting first (15 s ago), session 102 entered 5 s later
      assert.equal(metrics.longestWait.sessionId, 'claude-101');
      assert.equal(metrics.longestWait.group, 'alpha');
      // 101 has been awaiting since t=1_000_000, now is 1_015_000 → 15 s
      assert.equal(metrics.longestWait.seconds, 15);
    });

    it('should update longestWait when the longest-waiting session leaves', () => {
      classifier.setState(101, 'awaiting');
      classifier.setState(102, 'awaiting');
      const raw = [
        makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000),
        makeSession(102, '/projects/beta', 2, 'pts/1', 20_000),
      ];

      // Poll 1: both enter awaiting
      store.update(raw);

      advanceTime(10_000);

      // Session 101 leaves awaiting
      classifier.setState(101, 'active');
      store.update(raw);

      const { metrics } = store.getLatest();
      // Only session 102 is awaiting now, started 10 s ago
      assert.ok(metrics.longestWait);
      assert.equal(metrics.longestWait.sessionId, 'claude-102');
      assert.equal(metrics.longestWait.seconds, 10);
    });

    it('should return null when all sessions leave awaiting', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      store.update(raw);
      advanceTime(10_000);

      classifier.setState(101, 'active');
      store.update(raw);

      const { metrics } = store.getLatest();
      assert.equal(metrics.longestWait, null);
    });
  });

  // ── Dead PID cleanup ──────────────────────────────────────────────────

  describe('dead PID cleanup', () => {
    it('should clean up awaiting tracking when a PID disappears', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: enters awaiting
      store.update(raw);
      advanceTime(30_000);

      // Poll 2: PID 101 no longer alive (not in raw sessions)
      store.update([]);

      const { metrics } = store.getLatest();
      // longestWait should be null since the PID is gone
      assert.equal(metrics.longestWait, null);
    });

    it('should not accumulate time for dead PIDs', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: enters awaiting
      store.update(raw);

      // Advance 60 s, PID disappears
      advanceTime(60_000);
      store.update([]); // PID 101 gone — should not accumulate its 60s

      // The session was alive in awaitingStart at sweep time, but livePids
      // doesn't contain it. Let's check: the sweep checks livePids.has(pid).
      // Since 101 is not in livePids, it won't accumulate.
      const { metrics } = store.getLatest();
      assert.equal(metrics.awaitingAgentMinutes, 0);
    });

    it('should handle PIDs appearing and disappearing across multiple cycles', () => {
      // Cycle 1: PID 101 awaiting
      classifier.setState(101, 'awaiting');
      store.update([makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)]);

      // Cycle 2: 30 s later, PID 101 gone, PID 102 awaiting
      advanceTime(30_000);
      classifier.setState(102, 'awaiting');
      store.update([makeSession(102, '/projects/beta', 2, 'pts/1', 20_000)]);

      // Cycle 3: 30 s later, PID 102 still awaiting
      advanceTime(30_000);
      store.update([makeSession(102, '/projects/beta', 2, 'pts/1', 50_000)]);

      const { metrics } = store.getLatest();
      // PID 101: was in awaitingStart but livePids didn't have it at cycle 2 → 0
      // PID 102: entered awaiting at cycle 2, accumulated 30 s at cycle 3 → 30 s = 0.5 min
      assert.equal(metrics.awaitingAgentMinutes, 0.5);
      assert.ok(metrics.longestWait);
      assert.equal(metrics.longestWait.sessionId, 'claude-102');
    });
  });

  // ── Integration with real classifier ──────────────────────────────────

  describe('integration with real SessionClassifier', () => {
    it('should work end-to-end with the real classifier', () => {
      const realClassifier = new SessionClassifier();
      const realStore = new SessionStore(realClassifier);

      // An idle session (low CPU, old, TTY attached)
      const raw = [
        {
          pid: 200,
          cwd: '/home/user/project-x',
          cpu: 0.1,
          memMB: 150,
          tty: 'pts/0',
          hasChildren: false,
          startTime: Date.now() - 3_600_000, // 1 hour ago
        },
      ];

      const result = realStore.update(raw);

      // Verify structure
      assert.ok(result.metrics);
      assert.equal(typeof result.metrics.awaitingAgentMinutes, 'number');
      assert.ok(result.metrics.longestWait === null || typeof result.metrics.longestWait === 'object');
      assert.equal(result.sessions.length, 1);
      assert.equal(result.groups.length, 1);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty session list', () => {
      const result = store.update([]);
      assert.equal(result.metrics.awaitingAgentMinutes, 0);
      assert.equal(result.metrics.longestWait, null);
    });

    it('should handle first poll correctly (no previous state)', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      const result = store.update(raw);

      // First poll: no time accumulated yet (no previous poll to diff against)
      assert.equal(result.metrics.awaitingAgentMinutes, 0);
      // But longestWait should show 0 seconds (just entered)
      assert.ok(result.metrics.longestWait);
      assert.equal(result.metrics.longestWait.seconds, 0);
    });

    it('should handle session switching states rapidly', () => {
      const raw = [makeSession(101, '/projects/alpha', 1, 'pts/0', 15_000)];

      // Poll 1: active
      classifier.setState(101, 'active');
      store.update(raw);
      advanceTime(2_000);

      // Poll 2: awaiting
      classifier.setState(101, 'awaiting');
      store.update(raw);
      advanceTime(2_000);

      // Poll 3: active again
      classifier.setState(101, 'active');
      store.update(raw);
      advanceTime(2_000);

      // Poll 4: awaiting again
      classifier.setState(101, 'awaiting');
      store.update(raw);
      advanceTime(2_000);

      // Poll 5: still awaiting
      store.update(raw);

      const { metrics } = store.getLatest();
      // Accumulation:
      // Poll 2: enters awaiting (0 accumulated)
      // Poll 3: elapsed 2s, pid in awaitingStart → +2s, then leaves awaiting
      // Poll 4: enters awaiting again (0 accumulated here — not in awaitingStart at sweep)
      // Poll 5: elapsed 2s, pid in awaitingStart → +2s
      // Total: 4 s = 0.1 min (rounded)
      assert.equal(metrics.awaitingAgentMinutes, 0.1);
    });

    it('should correctly report group name from cwd basename', () => {
      classifier.setState(101, 'awaiting');
      const raw = [makeSession(101, '/home/user/deep/path/my-project', 1, 'pts/0', 15_000)];

      store.update(raw);

      const { metrics } = store.getLatest();
      assert.equal(metrics.longestWait.group, 'my-project');
    });
  });
});
