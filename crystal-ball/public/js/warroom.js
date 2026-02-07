// warroom.js — War Room stats dashboard panel.
// Slide-in panel with army overview, platoon leaderboard, and activity feed.

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
  const weights = { active: 3, awaiting: 1, idle: 0, stale: -1 };
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
        <span class="warroom-title">War Room</span>
        <button class="warroom-close">&times;</button>
      </div>
      <div class="warroom-section" data-section="overview">
        <div class="warroom-section-title">Army Overview</div>
        <div class="warroom-overview-body"></div>
      </div>
      <div class="warroom-section" data-section="leaderboard">
        <div class="warroom-section-title">Platoon Leaderboard</div>
        <div class="warroom-leaderboard-body"></div>
      </div>
      <div class="warroom-section" data-section="feed">
        <div class="warroom-section-title">Activity Feed</div>
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
   * @param {{ sessions: Array<{id: string, state: string, group: string, cpu?: number, mem?: number}>, groups: Array<{id: string, session_ids?: string[]}> }} apiData
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
    this._renderOverview(sessions);

    // --- Platoon Leaderboard ---
    this._renderLeaderboard(sessions, groups);

    // --- Activity Feed ---
    this._renderFeed();
  }

  // ── Internal renderers ───────────────────────────────────────────────────

  /** @param {Array} sessions */
  _renderOverview(sessions) {
    const counts = { active: 0, awaiting: 0, idle: 0, stale: 0 };
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
    body.innerHTML = `
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
        <div class="segment-idle" style="width:${pct(counts.idle)}%"></div>
        <div class="segment-stale" style="width:${pct(counts.stale)}%"></div>
      </div>
      <div class="warroom-stat-row" style="font-size:11px;opacity:0.7;">
        <span>${counts.active} active</span>
        <span>${counts.awaiting} awaiting</span>
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

    const groupsWithSessions = [];
    for (const [id, sess] of groupSessionMap) {
      groupsWithSessions.push({ id, sessions: sess });
    }

    const rows = sortedLeaderboard(groupsWithSessions);

    let html = `<table class="warroom-leaderboard">
      <tr>
        <th>Platoon</th>
        <th>Units</th>
        <th>Active</th>
        <th>Avg CPU</th>
        <th>Score</th>
      </tr>`;

    for (const r of rows) {
      html += `
      <tr>
        <td>${esc(r.id)}</td>
        <td>${r.unitCount}</td>
        <td>${r.activeCount}</td>
        <td>${r.avgCpu.toFixed(1)}%</td>
        <td>${r.score}</td>
      </tr>`;
    }
    html += '</table>';

    this.el.querySelector('.warroom-leaderboard-body').innerHTML = html;
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
