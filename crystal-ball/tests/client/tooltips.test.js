// tooltips.test.js — Unit tests for the tooltip pure helper functions.
//
// The functions under test (rankDisplayName, formatUptime,
// computeTooltipPosition, formatTooltipHTML) are pure logic with no THREE.js
// dependency, but the module imports THREE at the top level, so we run via
// the three-mock-loader:
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/tooltips.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  rankDisplayName,
  formatUptime,
  computeTooltipPosition,
  formatTooltipHTML,
} from '../../public/js/tooltips.js';

// ---------------------------------------------------------------------------
// rankDisplayName
// ---------------------------------------------------------------------------

describe('rankDisplayName', () => {
  it('returns Recruit for null', () => {
    assert.equal(rankDisplayName(null), 'Recruit');
  });

  it('returns Apprentice for bronze', () => {
    assert.equal(rankDisplayName('bronze'), 'Apprentice');
  });

  it('returns Journeyman for silver', () => {
    assert.equal(rankDisplayName('silver'), 'Journeyman');
  });

  it('returns Master for gold', () => {
    assert.equal(rankDisplayName('gold'), 'Master');
  });

  it('returns Recruit for unknown rank', () => {
    assert.equal(rankDisplayName('platinum'), 'Recruit');
  });

  it('returns Recruit for undefined', () => {
    assert.equal(rankDisplayName(undefined), 'Recruit');
  });
});

// ---------------------------------------------------------------------------
// formatUptime
// ---------------------------------------------------------------------------

describe('formatUptime', () => {
  it('returns "0s" for 0 seconds', () => {
    assert.equal(formatUptime(0), '0s');
  });

  it('returns "59s" for 59 seconds', () => {
    assert.equal(formatUptime(59), '59s');
  });

  it('returns "1m 0s" for 60 seconds', () => {
    assert.equal(formatUptime(60), '1m 0s');
  });

  it('returns "1h 1m 1s" for 3661 seconds', () => {
    assert.equal(formatUptime(3661), '1h 1m 1s');
  });

  it('returns "1h 0m 0s" for exactly 3600 seconds', () => {
    assert.equal(formatUptime(3600), '1h 0m 0s');
  });

  it('returns "2m 30s" for 150 seconds', () => {
    assert.equal(formatUptime(150), '2m 30s');
  });

  it('handles fractional seconds by flooring', () => {
    assert.equal(formatUptime(59.9), '59s');
  });
});

// ---------------------------------------------------------------------------
// computeTooltipPosition
// ---------------------------------------------------------------------------

describe('computeTooltipPosition', () => {
  const vw = 1920;
  const vh = 1080;
  const tw = 200;
  const th = 150;

  it('places tooltip 20px right and 10px below when space allows', () => {
    const pos = computeTooltipPosition(500, 400, tw, th, vw, vh);
    assert.equal(pos.left, 520);
    assert.equal(pos.top, 410);
  });

  it('flips to the left when tooltip would overflow right edge', () => {
    const pos = computeTooltipPosition(1800, 400, tw, th, vw, vh);
    // 1800 + 20 + 200 = 2020 > 1920 -> flip: 1800 - 200 - 20 = 1580
    assert.equal(pos.left, 1580);
    assert.equal(pos.top, 410);
  });

  it('flips above when tooltip would overflow bottom edge', () => {
    const pos = computeTooltipPosition(500, 1000, tw, th, vw, vh);
    // 1000 + 10 + 150 = 1160 > 1080 -> flip: 1000 - 150 - 10 = 840
    assert.equal(pos.left, 520);
    assert.equal(pos.top, 840);
  });

  it('flips both directions when tooltip would overflow both corners', () => {
    const pos = computeTooltipPosition(1800, 1000, tw, th, vw, vh);
    assert.equal(pos.left, 1580);
    assert.equal(pos.top, 840);
  });

  it('places normally at the exact boundary (no overflow)', () => {
    // Mouse at position where right placement just fits
    // left = mouseX + 20, needs left + tw <= vw
    // mouseX + 20 + tw = mouseX + 220 <= 1920 => mouseX <= 1700
    const pos = computeTooltipPosition(1700, 400, tw, th, vw, vh);
    assert.equal(pos.left, 1720);
    assert.equal(pos.top, 410);
  });

  it('flips when exceeding by exactly 1 pixel', () => {
    // mouseX + 20 + tw = 1701 + 220 = 1921 > 1920 -> flip
    const pos = computeTooltipPosition(1701, 400, tw, th, vw, vh);
    assert.equal(pos.left, 1481);
    assert.equal(pos.top, 410);
  });
});

// ---------------------------------------------------------------------------
// formatTooltipHTML
// ---------------------------------------------------------------------------

describe('formatTooltipHTML', () => {
  const unitData = {
    unitName: 'Aldric',
    unitClass: 'Builder',
    rank: 'silver',
  };

  const session = {
    state: 'active',
    cpu: 45.2,
    mem: 128,
    age_seconds: 5025,
    group: 'SimExLab',
  };

  it('contains the unit name', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('Aldric'), 'Should contain unit name');
  });

  it('contains the unit class', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('Builder'), 'Should contain unit class');
  });

  it('contains the rank display name', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('Journeyman'), 'Silver rank should display as Journeyman');
  });

  it('contains state with correct CSS class for active', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('tooltip-state-active'), 'Should contain state CSS class');
    assert.ok(html.includes('Active'), 'Should contain capitalized state');
  });

  it('contains state with correct CSS class for awaiting', () => {
    const awaitingSession = { ...session, state: 'awaiting' };
    const html = formatTooltipHTML(unitData, awaitingSession);
    assert.ok(html.includes('tooltip-state-awaiting'), 'Should contain awaiting CSS class');
    assert.ok(html.includes('Awaiting'), 'Should contain capitalized state');
  });

  it('contains CPU value', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('45.2%'), 'Should contain CPU percentage');
  });

  it('contains memory value', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('128 MB'), 'Should contain memory value');
  });

  it('contains uptime', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('1h 23m 45s'), 'Should contain formatted uptime');
  });

  it('contains group/platoon name', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('SimExLab'), 'Should contain group name');
  });

  it('handles null session gracefully', () => {
    const html = formatTooltipHTML(unitData, null);
    assert.ok(html.includes('Aldric'), 'Should still contain unit name');
    assert.ok(html.includes('Builder'), 'Should still contain class');
    assert.ok(html.includes('No session data'), 'Should show fallback text');
  });

  it('uses filled star for gold rank', () => {
    const goldUnit = { ...unitData, rank: 'gold' };
    const html = formatTooltipHTML(goldUnit, session);
    assert.ok(html.includes('\u2605'), 'Gold rank should use filled star');
  });

  it('uses empty star for non-gold ranks', () => {
    const html = formatTooltipHTML(unitData, session);
    assert.ok(html.includes('\u2606'), 'Silver rank should use empty star');
  });

  it('escapes HTML characters in unit name', () => {
    const xssUnit = { unitName: '<script>alert(1)</script>', unitClass: 'Builder', rank: null };
    const html = formatTooltipHTML(xssUnit, null);
    assert.ok(!html.includes('<script>'), 'Should escape HTML tags');
    assert.ok(html.includes('&lt;script&gt;'), 'Should contain escaped tags');
  });
});
