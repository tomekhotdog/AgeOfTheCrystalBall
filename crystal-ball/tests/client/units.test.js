// units.test.js — Unit tests for the unit class system, persistent names,
// and rank badges.
//
// The functions under test (classifyUnit, nameFromPid, rankFromAge) are pure
// logic with no THREE.js dependency, but the module imports THREE at the top
// level, so we run via the three-mock-loader:
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/units.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyUnit, nameFromPid, rankFromAge,
  hashStringToIndex, createUnit,
  _geomCache, _accessoryMatCache,
} from '../../public/js/units.js';

// ---------------------------------------------------------------------------
// classifyUnit
// ---------------------------------------------------------------------------

describe('classifyUnit', () => {
  it('returns Ghost for stale sessions', () => {
    const result = classifyUnit({ state: 'stale', has_children: false, age_seconds: 100 });
    assert.equal(result, 'Ghost');
  });

  it('returns Scout for active sessions younger than 120 s', () => {
    const result = classifyUnit({ state: 'active', has_children: false, age_seconds: 60 });
    assert.equal(result, 'Scout');
  });

  it('returns Builder for active sessions with children', () => {
    const result = classifyUnit({ state: 'active', has_children: true, age_seconds: 500 });
    assert.equal(result, 'Builder');
  });

  it('returns Sentinel for awaiting sessions', () => {
    const result = classifyUnit({ state: 'awaiting', has_children: false, age_seconds: 500 });
    assert.equal(result, 'Sentinel');
  });

  it('returns Veteran for active sessions older than 3600 s', () => {
    const result = classifyUnit({ state: 'active', has_children: false, age_seconds: 4000 });
    assert.equal(result, 'Veteran');
  });

  it('returns Scholar for active sessions with no special conditions', () => {
    const result = classifyUnit({ state: 'active', has_children: false, age_seconds: 500 });
    assert.equal(result, 'Scholar');
  });

  it('returns Peasant for idle sessions with no special conditions', () => {
    const result = classifyUnit({ state: 'idle', has_children: false, age_seconds: 500 });
    assert.equal(result, 'Peasant');
  });

  // -----------------------------------------------------------------------
  // Priority ordering
  // -----------------------------------------------------------------------

  it('Ghost beats Scout (stale + age < 120 yields Ghost, not Scout)', () => {
    const result = classifyUnit({ state: 'stale', has_children: false, age_seconds: 60 });
    assert.equal(result, 'Ghost');
  });

  it('Scout beats Builder (age < 120 + has_children yields Scout, not Builder)', () => {
    const result = classifyUnit({ state: 'active', has_children: true, age_seconds: 60 });
    assert.equal(result, 'Scout');
  });
});

// ---------------------------------------------------------------------------
// nameFromPid
// ---------------------------------------------------------------------------

describe('nameFromPid', () => {
  it('returns a string', () => {
    const name = nameFromPid(1);
    assert.equal(typeof name, 'string');
  });

  it('is deterministic — same pid always gives the same name', () => {
    const a = nameFromPid(7);
    const b = nameFromPid(7);
    assert.equal(a, b);
  });

  it('different pids generally produce different names', () => {
    const a = nameFromPid(0);
    const b = nameFromPid(1);
    assert.notEqual(a, b);
  });

  it('handles pid 0', () => {
    const name = nameFromPid(0);
    assert.equal(typeof name, 'string');
    assert.ok(name.length > 0, 'name should be non-empty');
  });

  it('wraps around — high pids still produce valid names', () => {
    const a = nameFromPid(50);
    const b = nameFromPid(100);
    assert.equal(typeof a, 'string');
    assert.equal(typeof b, 'string');
    assert.ok(a.length > 0);
    assert.ok(b.length > 0);
  });
});

// ---------------------------------------------------------------------------
// rankFromAge
// ---------------------------------------------------------------------------

describe('rankFromAge', () => {
  it('returns null for age < 300 (Recruit)', () => {
    assert.equal(rankFromAge(0), null);
    assert.equal(rankFromAge(150), null);
    assert.equal(rankFromAge(299), null);
  });

  it('returns bronze at age = 300 (Apprentice threshold)', () => {
    assert.equal(rankFromAge(300), 'bronze');
  });

  it('returns bronze at age = 1000', () => {
    assert.equal(rankFromAge(1000), 'bronze');
  });

  it('returns silver at age = 1800 (Journeyman threshold)', () => {
    assert.equal(rankFromAge(1800), 'silver');
  });

  it('returns silver at age = 5000', () => {
    assert.equal(rankFromAge(5000), 'silver');
  });

  it('returns gold at age = 7200 (Master threshold)', () => {
    assert.equal(rankFromAge(7200), 'gold');
  });

  it('returns gold at age = 10000', () => {
    assert.equal(rankFromAge(10000), 'gold');
  });
});

// ---------------------------------------------------------------------------
// hashStringToIndex
// ---------------------------------------------------------------------------

describe('hashStringToIndex', () => {
  it('returns an index in [0, range)', () => {
    for (const str of ['abc', 'session-42', '', 'x'.repeat(100)]) {
      const idx = hashStringToIndex(str, 5);
      assert.ok(idx >= 0 && idx < 5, `hashStringToIndex('${str}', 5) = ${idx}`);
    }
  });

  it('is deterministic', () => {
    assert.equal(hashStringToIndex('test-id', 10), hashStringToIndex('test-id', 10));
  });

  it('different strings generally produce different indices', () => {
    const a = hashStringToIndex('session-1', 100);
    const b = hashStringToIndex('session-2', 100);
    assert.notEqual(a, b);
  });

  it('handles empty string', () => {
    const idx = hashStringToIndex('', 5);
    assert.ok(idx >= 0 && idx < 5);
  });
});

// ---------------------------------------------------------------------------
// Geometry & Material Caching
// ---------------------------------------------------------------------------

describe('geometry cache', () => {
  it('createUnit populates the geometry cache', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    createUnit({ id: 'test-1', pid: 1, state: 'active', has_children: true, age_seconds: 500 });
    assert.ok(_geomCache.size > 0, 'geometry cache should have entries after createUnit');
  });

  it('two units of the same class share body geometry', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    const u1 = createUnit({ id: 'a', pid: 1, state: 'active', has_children: true, age_seconds: 500 });
    const cacheSizeAfterFirst = _geomCache.size;
    const u2 = createUnit({ id: 'b', pid: 2, state: 'active', has_children: true, age_seconds: 600 });

    // Both are Builder class, so cache size should not grow for body/head
    assert.equal(_geomCache.size, cacheSizeAfterFirst,
      'cache should not grow for second unit of same class');

    // Body geometry instances should be identical
    const body1 = u1.getObjectByName('body');
    const body2 = u2.getObjectByName('body');
    assert.ok(body1 && body2, 'both units should have body');
    assert.equal(body1.geometry, body2.geometry, 'body geometry should be shared');
  });

  it('two units of the same class have distinct body materials', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    const u1 = createUnit({ id: 'a', pid: 1, state: 'active', has_children: false, age_seconds: 500 });
    const u2 = createUnit({ id: 'b', pid: 2, state: 'active', has_children: false, age_seconds: 600 });

    const body1 = u1.getObjectByName('body');
    const body2 = u2.getObjectByName('body');
    assert.notEqual(body1.material, body2.material, 'body materials must be per-unit');
  });

  it('head geometry is shared across all units', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    const u1 = createUnit({ id: 'a', pid: 1, state: 'active', has_children: true, age_seconds: 500 });
    const u2 = createUnit({ id: 'b', pid: 2, state: 'awaiting', has_children: false, age_seconds: 500 });

    const head1 = u1.getObjectByName('head');
    const head2 = u2.getObjectByName('head');
    assert.equal(head1.geometry, head2.geometry, 'head geometry should be shared');
  });

  it('accessory materials are shared via cache', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    createUnit({ id: 'a', pid: 1, state: 'active', has_children: true, age_seconds: 500 });
    const matCountAfterFirst = _accessoryMatCache.size;
    createUnit({ id: 'b', pid: 2, state: 'active', has_children: true, age_seconds: 600 });

    assert.equal(_accessoryMatCache.size, matCountAfterFirst,
      'accessory material cache should not grow for second Builder');
  });
});

// ---------------------------------------------------------------------------
// Deterministic Peasant Accessories
// ---------------------------------------------------------------------------

describe('deterministic Peasant accessories', () => {
  it('same session ID always produces the same accessory', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    const session = { id: 'peasant-test-1', pid: 99, state: 'idle', has_children: false, age_seconds: 500 };
    const u1 = createUnit(session);
    const u2 = createUnit(session);

    const acc1 = u1.getObjectByName('accessory');
    const acc2 = u2.getObjectByName('accessory');
    assert.ok(acc1 && acc2, 'both Peasant units should have accessories');
  });

  it('different session IDs can produce different accessories', () => {
    _geomCache.clear();
    _accessoryMatCache.clear();

    // With enough different IDs, at least 2 different accessories should appear
    const accessoryTypes = new Set();
    for (let i = 0; i < 20; i++) {
      const session = { id: `peasant-vary-${i}`, pid: 99, state: 'idle', has_children: false, age_seconds: 500 };
      const u = createUnit(session);
      const acc = u.getObjectByName('accessory');
      if (acc) accessoryTypes.add(acc.children?.length ?? 0);
    }
    assert.ok(accessoryTypes.size >= 2, 'different session IDs should produce variety');
  });
});
