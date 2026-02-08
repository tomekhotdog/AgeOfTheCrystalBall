// tests/store.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RelayStore } from '../server/store.js';

describe('RelayStore', () => {
  let store;

  beforeEach(() => {
    store = new RelayStore(30000);
  });

  it('should publish and retrieve a snapshot', () => {
    const snapshot = { timestamp: 'now', sessions: [{ id: 'a' }], groups: [], metrics: {} };
    store.publish('Alice', '#FF0000', snapshot);
    const all = store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].user, 'Alice');
    assert.equal(all[0].color, '#FF0000');
    assert.deepStrictEqual(all[0].snapshot, snapshot);
  });

  it('should upsert on repeated publish from same user', () => {
    store.publish('Alice', '#FF0000', { sessions: [{ id: 'a' }] });
    store.publish('Alice', '#FF0000', { sessions: [{ id: 'b' }] });
    const all = store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].snapshot.sessions[0].id, 'b');
  });

  it('should return multiple users', () => {
    store.publish('Alice', '#FF0000', { sessions: [] });
    store.publish('Bob', '#00FF00', { sessions: [] });
    const all = store.getAll();
    assert.equal(all.length, 2);
  });

  it('should expire entries after expiryMs', () => {
    const shortStore = new RelayStore(1); // 1ms expiry
    shortStore.publish('Alice', '#FF0000', { sessions: [] });
    // Wait briefly for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    const all = shortStore.getAll();
    assert.equal(all.length, 0);
  });

  it('should return empty array when no entries', () => {
    const all = store.getAll();
    assert.equal(all.length, 0);
  });

  it('getUserList should return user metadata', () => {
    store.publish('Alice', '#FF0000', { sessions: [{ id: 'a' }, { id: 'b' }] });
    const users = store.getUserList();
    assert.equal(users.length, 1);
    assert.equal(users[0].name, 'Alice');
    assert.equal(users[0].color, '#FF0000');
    assert.equal(users[0].sessionCount, 2);
    assert.ok(users[0].lastSeen);
  });

  it('getUserList should filter expired users', () => {
    const shortStore = new RelayStore(1);
    shortStore.publish('Alice', '#FF0000', { sessions: [] });
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    const users = shortStore.getUserList();
    assert.equal(users.length, 0);
  });

  it('getUserList should return empty array when no entries', () => {
    const users = store.getUserList();
    assert.equal(users.length, 0);
  });
});
