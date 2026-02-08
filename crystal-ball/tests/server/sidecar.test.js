// tests/server/sidecar.test.js
// Tests for sidecar file reading and validation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSidecar, VALID_PHASES, STALE_THRESHOLD_MS } from '../../server/discovery/sidecar.js';

describe('sidecar validateSidecar()', () => {
  const NOW = 1_700_000_000_000;

  function freshPayload(overrides = {}) {
    return {
      task: 'Implement auth system',
      phase: 'coding',
      blocked: false,
      detail: 'Working on login.js',
      updated_at: new Date(NOW - 5_000).toISOString(), // 5 s ago
      ...overrides,
    };
  }

  it('should accept a valid payload', () => {
    const { valid, context } = validateSidecar(freshPayload(), NOW);
    assert.equal(valid, true);
    assert.equal(context.task, 'Implement auth system');
    assert.equal(context.phase, 'coding');
    assert.equal(context.blocked, false);
    assert.equal(context.detail, 'Working on login.js');
    assert.equal(context.stale, false);
  });

  it('should reject null input', () => {
    const { valid, context } = validateSidecar(null, NOW);
    assert.equal(valid, false);
    assert.equal(context, null);
  });

  it('should reject non-object input', () => {
    const { valid } = validateSidecar('hello', NOW);
    assert.equal(valid, false);
  });

  it('should reject missing task', () => {
    const { valid } = validateSidecar(freshPayload({ task: undefined }), NOW);
    assert.equal(valid, false);
  });

  it('should reject empty task string', () => {
    const { valid } = validateSidecar(freshPayload({ task: '' }), NOW);
    assert.equal(valid, false);
  });

  it('should reject missing phase', () => {
    const { valid } = validateSidecar(freshPayload({ phase: undefined }), NOW);
    assert.equal(valid, false);
  });

  it('should reject invalid phase', () => {
    const { valid } = validateSidecar(freshPayload({ phase: 'hacking' }), NOW);
    assert.equal(valid, false);
  });

  it('should accept all valid phases', () => {
    for (const phase of VALID_PHASES) {
      const { valid, context } = validateSidecar(freshPayload({ phase }), NOW);
      assert.equal(valid, true, `phase "${phase}" should be valid`);
      assert.equal(context.phase, phase);
    }
  });

  it('should have exactly 6 valid phases', () => {
    assert.equal(VALID_PHASES.length, 6);
  });

  it('should reject removed phase "debugging"', () => {
    const { valid } = validateSidecar(freshPayload({ phase: 'debugging' }), NOW);
    assert.equal(valid, false);
  });

  it('should reject removed phase "documenting"', () => {
    const { valid } = validateSidecar(freshPayload({ phase: 'documenting' }), NOW);
    assert.equal(valid, false);
  });

  it('should reject missing updated_at', () => {
    const { valid } = validateSidecar(freshPayload({ updated_at: undefined }), NOW);
    assert.equal(valid, false);
  });

  it('should reject unparseable updated_at', () => {
    const { valid } = validateSidecar(freshPayload({ updated_at: 'not-a-date' }), NOW);
    assert.equal(valid, false);
  });

  it('should mark fresh sidecar as not stale', () => {
    const { context } = validateSidecar(freshPayload(), NOW);
    assert.equal(context.stale, false);
  });

  it('should mark old sidecar as stale', () => {
    const old = new Date(NOW - STALE_THRESHOLD_MS - 1_000).toISOString();
    const { valid, context } = validateSidecar(freshPayload({ updated_at: old }), NOW);
    assert.equal(valid, true);
    assert.equal(context.stale, true);
  });

  it('should default detail to null when missing', () => {
    const { context } = validateSidecar(freshPayload({ detail: undefined }), NOW);
    assert.equal(context.detail, null);
  });

  it('should coerce blocked to boolean', () => {
    const { context: c1 } = validateSidecar(freshPayload({ blocked: true }), NOW);
    assert.equal(c1.blocked, true);

    const { context: c2 } = validateSidecar(freshPayload({ blocked: 0 }), NOW);
    assert.equal(c2.blocked, false);

    const { context: c3 } = validateSidecar(freshPayload({ blocked: 'yes' }), NOW);
    assert.equal(c3.blocked, true);
  });
});
