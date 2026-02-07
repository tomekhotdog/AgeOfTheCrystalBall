// tests/client/perfMonitor.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rollingStats, fmtMs, microBar, formatSnapshot } from '../../public/js/perfMonitor.js';

describe('rollingStats', () => {
  it('returns zeros for empty input', () => {
    const s = rollingStats([], 0);
    assert.equal(s.avg, 0);
    assert.equal(s.min, 0);
    assert.equal(s.max, 0);
    assert.equal(s.p95, 0);
  });

  it('computes correct stats for a single value', () => {
    const s = rollingStats([10], 1);
    assert.equal(s.avg, 10);
    assert.equal(s.min, 10);
    assert.equal(s.max, 10);
    assert.equal(s.p95, 10);
  });

  it('computes correct avg/min/max', () => {
    const buf = [5, 10, 15, 20, 25];
    const s = rollingStats(buf, 5);
    assert.equal(s.avg, 15);
    assert.equal(s.min, 5);
    assert.equal(s.max, 25);
  });

  it('computes p95 from sorted values', () => {
    // 20 values: 1..20, p95 index = floor(20*0.95) = 19 -> value 20
    const buf = Array.from({ length: 20 }, (_, i) => i + 1);
    const s = rollingStats(buf, 20);
    assert.equal(s.p95, 20);
  });

  it('respects count parameter (partial buffer)', () => {
    const buf = [5, 10, 15, 0, 0, 0]; // only first 3 valid
    const s = rollingStats(buf, 3);
    assert.equal(s.avg, 10);
    assert.equal(s.min, 5);
    assert.equal(s.max, 15);
  });
});

describe('fmtMs', () => {
  it('formats sub-0.1 as 0.0', () => {
    assert.equal(fmtMs(0.05), '0.0');
  });

  it('formats small values with 1 decimal', () => {
    assert.equal(fmtMs(3.14), '3.1');
    assert.equal(fmtMs(9.99), '10.0'); // rounds up to 10.0
  });

  it('formats values >= 10 as integers', () => {
    assert.equal(fmtMs(16.7), '17');
    assert.equal(fmtMs(100.4), '100');
  });
});

describe('microBar', () => {
  it('returns empty bar for 0ms', () => {
    const bar = microBar(0, 16.67, 10);
    assert.equal(bar.length, 10);
    assert.ok(!bar.includes('\u2588')); // no filled blocks
  });

  it('returns full bar when value equals budget', () => {
    const bar = microBar(16.67, 16.67, 10);
    assert.equal(bar, '\u2588'.repeat(10));
  });

  it('returns half bar for half budget', () => {
    const bar = microBar(8.33, 16.67, 10);
    // ~5 filled blocks
    const filled = (bar.match(/\u2588/g) || []).length;
    assert.ok(filled >= 4 && filled <= 6, `expected ~5 filled, got ${filled}`);
  });

  it('caps at width for values over budget', () => {
    const bar = microBar(50, 16.67, 10);
    assert.equal(bar.length, 10);
    assert.equal(bar, '\u2588'.repeat(10));
  });
});

describe('formatSnapshot', () => {
  const sample = {
    ts: '2026-02-07T12:00:00.000Z',
    fps: 30,
    wall: { avg: 33.33, p95: 40, max: 55 },
    jsWork: { avg: 12, p95: 16, max: 22 },
    gpuWait: 21.33,
    segments: {
      camera: { avg: 0.5, p95: 1.0 },
      render: { avg: 10, p95: 14 },
    },
    gpu: { drawCalls: 120, triangles: 45000, geometries: 80, textures: 5 },
    jank: { count: 10, total: 300, pct: 3.33 },
  };

  it('includes FPS and wall times', () => {
    const text = formatSnapshot(sample);
    assert.ok(text.includes('FPS: 30'));
    assert.ok(text.includes('Wall: avg 33.33ms'));
    assert.ok(text.includes('p95 40ms'));
  });

  it('includes segments', () => {
    const text = formatSnapshot(sample);
    assert.ok(text.includes('camera'));
    assert.ok(text.includes('render'));
  });

  it('includes GPU info', () => {
    const text = formatSnapshot(sample);
    assert.ok(text.includes('Draw calls: 120'));
    assert.ok(text.includes('Triangles: 45000'));
  });

  it('includes jank stats', () => {
    const text = formatSnapshot(sample);
    assert.ok(text.includes('10/300'));
    assert.ok(text.includes('3.33%'));
  });
});
