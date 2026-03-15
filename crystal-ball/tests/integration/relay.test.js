// tests/integration/relay.test.js
// Integration tests for the relay server (multi-person snapshot merging).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fetchJSON, postJSON } from './helpers.js';

describe('Relay server', () => {
  let relay;
  const TOKEN = 'test-token-xyz';

  before(async () => {
    relay = await startServer({
      script: '../crystal-ball-relay/server/index.js',
      args: ['--port', '4112', '--token', TOKEN],
      timeout: 5000,
    });
  });

  after(async () => {
    if (relay) await relay.kill();
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  it('should reject POST without token', async () => {
    const { status } = await postJSON(`${relay.url}/api/publish`, {
      user: 'alice',
      snapshot: { sessions: [], groups: [], metrics: {} },
    });
    assert.equal(status, 401);
  });

  it('should reject GET /api/combined without token', async () => {
    const { status } = await fetchJSON(`${relay.url}/api/combined`);
    assert.equal(status, 401);
  });

  it('should reject GET /api/users without token', async () => {
    const { status } = await fetchJSON(`${relay.url}/api/users`);
    assert.equal(status, 401);
  });

  it('should reject invalid token', async () => {
    const { status } = await postJSON(`${relay.url}/api/publish`, {
      user: 'alice',
      snapshot: { sessions: [], groups: [], metrics: {} },
    }, 'wrong-token');
    assert.equal(status, 403);
  });

  // ── Publish + Combined ─────────────────────────────────────────────────

  it('should accept valid publish and return 204', async () => {
    const { status } = await postJSON(`${relay.url}/api/publish`, {
      user: 'alice',
      color: '#FF0000',
      snapshot: {
        timestamp: Date.now(),
        sessions: [
          { id: 's1', group: 'proj-a', state: 'active', cpu: 10, mem: 100 },
        ],
        groups: [{ id: 'proj-a', session_count: 1, session_ids: ['s1'] }],
        metrics: { awaitingAgentMinutes: 0, blockedCount: 0, longestWait: null },
      },
    }, TOKEN);
    assert.equal(status, 204);
  });

  it('should return combined data after publish', async () => {
    const { status, data } = await fetchJSON(`${relay.url}/api/combined`, TOKEN);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.sessions), 'combined should have sessions');
    assert.ok(data.sessions.length >= 1, 'should include published sessions');
    assert.ok(Array.isArray(data.groups), 'combined should have groups');
    assert.ok(data.metrics, 'combined should have metrics');
  });

  it('should namespace session IDs with user prefix', async () => {
    const { data } = await fetchJSON(`${relay.url}/api/combined`, TOKEN);
    const aliceSession = data.sessions.find(s => s.id === 'alice/s1');
    assert.ok(aliceSession, 'session should be namespaced as alice/s1');
    assert.equal(aliceSession.owner, 'alice');
    assert.equal(aliceSession.ownerColor, '#FF0000');
  });

  // ── Multi-user merging ─────────────────────────────────────────────────

  it('should merge snapshots from multiple users', async () => {
    // Publish from a second user
    await postJSON(`${relay.url}/api/publish`, {
      user: 'bob',
      color: '#0000FF',
      snapshot: {
        timestamp: Date.now(),
        sessions: [
          { id: 's2', group: 'proj-b', state: 'awaiting', cpu: 5, mem: 200 },
        ],
        groups: [{ id: 'proj-b', session_count: 1, session_ids: ['s2'] }],
        metrics: { awaitingAgentMinutes: 2, blockedCount: 0, longestWait: null },
      },
    }, TOKEN);

    const { data } = await fetchJSON(`${relay.url}/api/combined`, TOKEN);
    assert.ok(data.sessions.length >= 2, 'should have sessions from both users');

    const owners = new Set(data.sessions.map(s => s.owner));
    assert.ok(owners.has('alice'), 'should include alice');
    assert.ok(owners.has('bob'), 'should include bob');
  });

  it('should aggregate metrics across users', async () => {
    const { data } = await fetchJSON(`${relay.url}/api/combined`, TOKEN);
    assert.ok(typeof data.metrics.awaitingAgentMinutes === 'number');
  });

  // ── User roster ────────────────────────────────────────────────────────

  it('should list online users', async () => {
    const { status, data } = await fetchJSON(`${relay.url}/api/users`, TOKEN);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.users));
    assert.ok(data.users.length >= 2, 'should have at least alice and bob');

    const names = data.users.map(u => u.name);
    assert.ok(names.includes('alice'));
    assert.ok(names.includes('bob'));
  });

  it('should include session count and color in user roster', async () => {
    const { data } = await fetchJSON(`${relay.url}/api/users`, TOKEN);
    const alice = data.users.find(u => u.name === 'alice');
    assert.ok(alice);
    assert.equal(alice.color, '#FF0000');
    assert.equal(alice.sessionCount, 1);
  });

  // ── Validation ─────────────────────────────────────────────────────────

  it('should reject publish with missing user', async () => {
    const { status } = await postJSON(`${relay.url}/api/publish`, {
      snapshot: { sessions: [], groups: [], metrics: {} },
    }, TOKEN);
    assert.equal(status, 400);
  });

  it('should reject publish with missing snapshot', async () => {
    const { status } = await postJSON(`${relay.url}/api/publish`, {
      user: 'charlie',
    }, TOKEN);
    assert.equal(status, 400);
  });
});
