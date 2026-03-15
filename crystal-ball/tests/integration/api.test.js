// tests/integration/api.test.js
// Integration tests for the Crystal Ball API server in simulate mode.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fetchJSON } from './helpers.js';

describe('API server (simulate mode)', () => {
  let server;

  before(async () => {
    server = await startServer({
      script: 'server/index.js',
      args: ['--port', '4111', '--simulate'],
      timeout: 8000,
    });
  });

  after(async () => {
    if (server) await server.kill();
  });

  // ── GET /api/sessions ───────────────────────────────────────────────────

  it('should return sessions with correct shape', async () => {
    const { status, data } = await fetchJSON(`${server.url}/api/sessions`);
    assert.equal(status, 200);
    assert.ok(data.timestamp, 'should have timestamp');
    assert.ok(Array.isArray(data.sessions), 'sessions should be array');
    assert.ok(Array.isArray(data.groups), 'groups should be array');
    assert.ok(data.metrics, 'should have metrics');
  });

  it('should return multiple sessions in simulate mode', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    assert.ok(data.sessions.length > 0, 'should have at least one session');
  });

  it('should include required fields on each session', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    const session = data.sessions[0];
    assert.ok('id' in session, 'session.id');
    assert.ok('pid' in session, 'session.pid');
    assert.ok('state' in session, 'session.state');
    assert.ok('cpu' in session, 'session.cpu');
    assert.ok('mem' in session, 'session.mem');
    assert.ok('age_seconds' in session, 'session.age_seconds');
    assert.ok('group' in session, 'session.group');
    assert.ok('mode' in session, 'session.mode');
  });

  it('should only contain valid states', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    const validStates = new Set(['active', 'awaiting', 'blocked', 'idle', 'stale']);
    for (const s of data.sessions) {
      assert.ok(validStates.has(s.state), `invalid state: ${s.state}`);
    }
  });

  it('should include groups with id and session_count', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    assert.ok(data.groups.length > 0, 'should have groups');
    const group = data.groups[0];
    assert.ok('id' in group, 'group.id');
    assert.ok('session_count' in group, 'group.session_count');
    assert.ok('session_ids' in group, 'group.session_ids');
  });

  it('should include metrics with awaiting fields', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    assert.ok('awaitingAgentMinutes' in data.metrics);
    assert.ok('longestWait' in data.metrics);
    assert.ok('blockedCount' in data.metrics);
  });

  // ── GET /api/mode ──────────────────────────────────────────────────────

  it('should report local mode when no relay configured', async () => {
    const { status, data } = await fetchJSON(`${server.url}/api/mode`);
    assert.equal(status, 200);
    assert.equal(data.mode, 'local');
    assert.equal(data.relay, null);
  });

  // ── GET /api/combined (no relay) ───────────────────────────────────────

  it('should return 404 for /api/combined when no relay', async () => {
    const { status } = await fetchJSON(`${server.url}/api/combined`);
    assert.equal(status, 404);
  });

  // ── Mode 2 sessions ────────────────────────────────────────────────────

  it('should include Mode 2 sessions with context', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    const mode2 = data.sessions.filter(s => s.mode === 2);
    // Simulator has ~60% Mode 2
    assert.ok(mode2.length > 0, 'should have Mode 2 sessions');
    for (const s of mode2) {
      assert.ok(s.context, 'Mode 2 session should have context');
      assert.ok('task' in s.context, 'context.task');
      assert.ok('phase' in s.context, 'context.phase');
    }
  });

  // ── Consistency checks ─────────────────────────────────────────────────

  it('should have consistent session-to-group mapping', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    const groupIds = new Set(data.groups.map(g => g.id));
    for (const s of data.sessions) {
      assert.ok(groupIds.has(s.group), `session ${s.id} references unknown group ${s.group}`);
    }
  });

  it('should have correct session counts per group', async () => {
    const { data } = await fetchJSON(`${server.url}/api/sessions`);
    for (const g of data.groups) {
      const actualCount = data.sessions.filter(s => s.group === g.id).length;
      assert.equal(g.session_count, actualCount, `group ${g.id} count mismatch`);
    }
  });

  // ── POST /api/perf ─────────────────────────────────────────────────────

  it('should accept and return perf data', async () => {
    const perfData = { fps: 60, drawCalls: 120, timestamp: Date.now() };
    const postRes = await fetch(`${server.url}/api/perf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(perfData),
    });
    assert.equal(postRes.status, 204);

    const { status, data } = await fetchJSON(`${server.url}/api/perf`);
    assert.equal(status, 200);
    assert.ok(data.latest, 'should have latest perf snapshot');
    assert.equal(data.latest.fps, 60);
  });
});
