// warroom.js -- Trading Floor stats dashboard panel.
// Slide-in panel with portfolio overview, desk leaderboard, and trade log.

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Compute activity score for a group.
 * active=3, awaiting=1, idle=0, stale=-1
 * @param {Array<{state: string}>} sessions
 * @returns {number}
 */
export function activityScore(sessions) {
  const weights = { active: 3, awaiting: 1, blocked: 0, idle: 0, stale: -1 };
  let score = 0;
  for (const s of sessions) {
    score += weights[s.state] ?? 0;
  }
  return score;
}

/**
 * Sort groups by activity score descending.
 * @param {Array<{id: string, sessions: Array<{state: string, cpu?: number}>}>} groupsWithSessions
 * @returns {Array<{id: string, score: number, unitCount: number, activeCount: number, avgCpu: number}>}
 */
export function sortedLeaderboard(groupsWithSessions) {
  return groupsWithSessions
    .map(g => {
      const sessions = g.sessions || [];
      const unitCount = sessions.length;
      let activeCount = 0;
      let totalCpu = 0;
      for (const s of sessions) {
        if (s.state === 'active') activeCount++;
        totalCpu += s.cpu ?? 0;
      }
      return {
        id: g.id,
        score: activityScore(sessions),
        unitCount,
        activeCount,
        avgCpu: unitCount > 0 ? totalCpu / unitCount : 0,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Detect state transitions between two snapshots.
 * @param {Map<string, string>} prevStates — pid → state
 * @param {Array<{id: string, state: string, group: string}>} currentSessions
 * @returns {Array<{sessionId: string, group: string, fromState: string, toState: string, time: Date}>}
 */
export function detectTransitions(prevStates, currentSessions) {
  const transitions = [];
  const now = new Date();
  for (const s of currentSessions) {
    const prev = prevStates.get(s.id);
    if (prev === undefined) {
      // New session — treat as transition from 'new'
      transitions.push({
        sessionId: s.id,
        group: s.group,
        fromState: 'new',
        toState: s.state,
        time: now,
      });
    } else if (prev !== s.state) {
      transitions.push({
        sessionId: s.id,
        group: s.group,
        fromState: prev,
        toState: s.state,
        time: now,
      });
    }
  }
  return transitions;
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Minimal HTML escaping.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a Date to HH:MM string.
 * @param {Date} d
 * @returns {string}
 */
function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// WarRoom class
// ---------------------------------------------------------------------------

export class WarRoom {
  constructor() {
    /** @type {Map<string, string>} pid → state from last update */
    this._prevStates = new Map();
    /** @type {Array<{sessionId: string, group: string, fromState: string, toState: string, time: Date}>} */
    this._feed = [];

    // Build the panel DOM
    this.el = document.createElement('div');
    this.el.className = 'warroom-panel hidden';
    this.el.id = 'warroom-panel';

    this.el.innerHTML = `
      <div class="warroom-header">
        <span class="warroom-title">Trading Floor</span>
        <button class="warroom-close">&times;</button>
      </div>
      <div class="warroom-section" data-section="overview">
        <div class="warroom-section-title">Portfolio Overview</div>
        <div class="warroom-overview-body"></div>
      </div>
      <div class="warroom-section" data-section="leaderboard">
        <div class="warroom-section-title">Desk Leaderboard</div>
        <div class="warroom-leaderboard-body"></div>
      </div>
      <div class="warroom-section" data-section="mode2">
        <div class="warroom-section-title">Mode 2 Intel</div>
        <div class="warroom-mode2-body"></div>
      </div>
      <div class="warroom-section" data-section="feed">
        <div class="warroom-section-title">Trade Log</div>
        <div class="warroom-feed"></div>
      </div>
    `;

    document.body.appendChild(this.el);

    // Wire close button
    this.el.querySelector('.warroom-close').addEventListener('click', () => this.hide());
  }

  // ── Visibility ───────────────────────────────────────────────────────────

  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  isVisible() {
    return !this.el.classList.contains('hidden');
  }

  // ── Update (called each poll cycle) ──────────────────────────────────────

  /**
   * @param {{ sessions: Array<{id: string, state: string, group: string, cpu?: number, mem?: number}>, groups: Array<{id: string, session_ids?: string[], owners?: string[]}>, users?: Array<{name: string, color: string, sessionCount: number}> }} apiData
   */
  update(apiData) {
    const sessions = apiData.sessions || [];
    const groups = apiData.groups || [];

    // --- Detect transitions before updating prevStates ---
    const transitions = detectTransitions(this._prevStates, sessions);

    // Prepend new transitions to feed (newest first), cap at 20
    if (transitions.length > 0) {
      this._feed = [...transitions, ...this._feed].slice(0, 20);
    }

    // Update prevStates for next cycle
    this._prevStates = new Map();
    for (const s of sessions) {
      this._prevStates.set(s.id, s.state);
    }

    // --- Army Overview ---
    this._renderOverview(sessions, apiData.users);

    // --- Mode 2 Intel ---
    this._renderMode2(sessions);

    // --- Platoon Leaderboard ---
    this._renderLeaderboard(sessions, groups);

    // --- Activity Feed ---
    this._renderFeed();
  }

  // ── Internal renderers ───────────────────────────────────────────────────

  /**
   * @param {Array} sessions
   * @param {Array|undefined} users
   */
  _renderOverview(sessions, users) {
    const counts = { active: 0, awaiting: 0, blocked: 0, idle: 0, stale: 0 };
    let totalCpu = 0;
    let totalMem = 0;

    for (const s of sessions) {
      if (counts[s.state] !== undefined) counts[s.state]++;
      totalCpu += s.cpu ?? 0;
      totalMem += s.mem ?? 0;
    }

    const total = sessions.length;
    const cpuStr = totalCpu.toFixed(1) + '%';
    const memStr = Math.round(totalMem) + ' MB';

    // State distribution bar widths (percentage of total)
    const pct = (n) => total > 0 ? (n / total * 100).toFixed(1) : 0;

    const body = this.el.querySelector('.warroom-overview-body');
    const playersHtml = users && users.length > 0
      ? `<div class="warroom-stat-row">
        <span class="warroom-stat-label">Players Online</span>
        <span class="warroom-stat-value">${users.length}</span>
      </div>
      <div class="warroom-stat-row" style="font-size:11px;opacity:0.7;flex-wrap:wrap;gap:4px;">
        ${users.map(u => `<span><span class="owner-dot" style="background:${esc(u.color)}"></span> ${esc(u.name)}</span>`).join(' ')}
      </div>`
      : '';
    body.innerHTML = `
      ${playersHtml}
      <div class="warroom-stat-row">
        <span class="warroom-stat-label">Total Sessions</span>
        <span class="warroom-stat-value">${total}</span>
      </div>
      <div class="warroom-stat-row">
        <span class="warroom-stat-label">Total CPU</span>
        <span class="warroom-stat-value">${cpuStr}</span>
      </div>
      <div class="warroom-stat-row">
        <span class="warroom-stat-label">Total Memory</span>
        <span class="warroom-stat-value">${memStr}</span>
      </div>
      <div class="warroom-state-bar">
        <div class="segment-active" style="width:${pct(counts.active)}%"></div>
        <div class="segment-awaiting" style="width:${pct(counts.awaiting)}%"></div>
        <div class="segment-blocked" style="width:${pct(counts.blocked)}%"></div>
        <div class="segment-idle" style="width:${pct(counts.idle)}%"></div>
        <div class="segment-stale" style="width:${pct(counts.stale)}%"></div>
      </div>
      <div class="warroom-stat-row" style="font-size:11px;opacity:0.7;">
        <span>${counts.active} active</span>
        <span>${counts.awaiting} awaiting</span>
        ${counts.blocked > 0 ? `<span style="color:#D87068">${counts.blocked} blocked</span>` : ''}
        <span>${counts.idle} idle</span>
        <span>${counts.stale} stale</span>
      </div>
    `;
  }

  /**
   * @param {Array} sessions
   * @param {Array} groups
   */
  _renderLeaderboard(sessions, groups) {
    // Build group → sessions map
    const groupSessionMap = new Map();
    for (const s of sessions) {
      const gid = s.group || 'ungrouped';
      if (!groupSessionMap.has(gid)) groupSessionMap.set(gid, []);
      groupSessionMap.get(gid).push(s);
    }

    // Build owners map from groups data
    const ownersMap = new Map();
    for (const g of groups) {
      if (g.owners) ownersMap.set(g.id, g.owners);
    }

    // Build ownerColor lookup from sessions
    const ownerColorMap = new Map();
    for (const s of sessions) {
      if (s.owner && s.ownerColor) ownerColorMap.set(s.owner, s.ownerColor);
    }

    const groupsWithSessions = [];
    for (const [id, sess] of groupSessionMap) {
      groupsWithSessions.push({ id, sessions: sess });
    }

    const rows = sortedLeaderboard(groupsWithSessions);

    let html = `<table class="warroom-leaderboard">
      <tr>
        <th>Desk</th>
        <th>Units</th>
        <th>Active</th>
        <th>Avg CPU</th>
        <th>Score</th>
      </tr>`;

    for (const r of rows) {
      const owners = ownersMap.get(r.id);
      const ownerDots = owners
        ? owners.map(o => `<span class="owner-dot" style="background:${esc(ownerColorMap.get(o) || '#60C0F0')}" title="${esc(o)}"></span>`).join('')
        : '';
      html += `
      <tr>
        <td>${esc(r.id)} ${ownerDots}</td>
        <td>${r.unitCount}</td>
        <td>${r.activeCount}</td>
        <td>${r.avgCpu.toFixed(1)}%</td>
        <td>${r.score}</td>
      </tr>`;
    }
    html += '</table>';

    this.el.querySelector('.warroom-leaderboard-body').innerHTML = html;
  }

  /** @param {Array} sessions */
  _renderMode2(sessions) {
    const body = this.el.querySelector('.warroom-mode2-body');
    if (!body) return;

    const mode2 = sessions.filter(s => s.mode === 2);
    const mode1 = sessions.length - mode2.length;

    if (mode2.length === 0) {
      body.innerHTML = '<div style="opacity:0.4;">No Mode 2 sessions.</div>';
      return;
    }

    // Phase distribution
    const phaseCounts = {};
    const blockedSessions = [];
    for (const s of mode2) {
      const phase = s.context?.phase || 'unknown';
      phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
      if (s.state === 'blocked' || s.context?.blocked) {
        blockedSessions.push(s);
      }
    }

    const phaseBar = Object.entries(phaseCounts)
      .map(([phase, count]) => `<span style="opacity:0.8;">${count} ${phase}</span>`)
      .join(' ');

    const blockedHtml = blockedSessions.length > 0
      ? blockedSessions.map(s =>
          `<div style="color:#D87068;font-size:11px;">${esc(s.id)} (${esc(s.group)}) - ${esc(s.context?.detail || 'blocked')}</div>`
        ).join('')
      : '';

    body.innerHTML = `
      <div class="warroom-stat-row">
        <span class="warroom-stat-label">Mode 2</span>
        <span class="warroom-stat-value">${mode2.length}</span>
      </div>
      <div class="warroom-stat-row">
        <span class="warroom-stat-label">Mode 1</span>
        <span class="warroom-stat-value">${mode1}</span>
      </div>
      <div class="warroom-stat-row" style="font-size:11px;opacity:0.7;flex-wrap:wrap;gap:4px;">
        ${phaseBar}
      </div>
      ${blockedHtml ? `<div style="margin-top:4px;">${blockedHtml}</div>` : ''}
    `;
  }

  _renderFeed() {
    const feedEl = this.el.querySelector('.warroom-feed');
    if (this._feed.length === 0) {
      feedEl.innerHTML = '<div style="opacity:0.4;">No transitions yet.</div>';
      return;
    }

    let html = '';
    for (const entry of this._feed) {
      const timeStr = hhmm(entry.time);
      const stateClass = 'warroom-feed-state-' + entry.toState;
      html += `
        <div class="warroom-feed-entry">
          <span class="warroom-feed-time">${timeStr}</span>
          <span class="${stateClass}">${esc(entry.sessionId)} (${esc(entry.group)}) &rarr; ${entry.toState}</span>
        </div>`;
    }

    feedEl.innerHTML = html;
  }
}

export default WarRoom;
