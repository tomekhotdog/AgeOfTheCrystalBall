// selectionPanel.js -- Selection panel DOM generation and updates.
// Shows detailed info for a selected unit or a group summary.

import { classifyUnit, rankFromAge, rankDisplayTitle } from './units.js';
import { escapeHTML, formatUptime, countSessionStates } from './utils.js';

export class SelectionPanel {
  constructor() {
    /** @type {HTMLElement} */
    this.el = document.getElementById('selection-panel');
  }

  // ---------------------------------------------------------------------------
  // showUnit — display detailed session info
  // ---------------------------------------------------------------------------

  /**
   * @param {{ id: string, state: string, group: string, cwd: string, pid: number, cpu: number, mem: number, age_seconds: number, tty: string, has_children: boolean }} session
   */
  showUnit(session) {
    const uptime = formatUptime(session.age_seconds);
    const cpuPct = Math.min(session.cpu, 100).toFixed(1);
    const memMB = typeof session.mem === 'number' ? session.mem.toFixed(0) : '—';
    const role = classifyUnit(session);
    const rank = rankFromAge(session.age_seconds ?? 0);
    const roleTitle = rankDisplayTitle(rank, role);

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">${escapeHTML(session.id)}</span>
        <span class="panel-badge ${session.state}">${escapeHTML(roleTitle)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Project</span>
        <span>${escapeHTML(session.group)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Directory</span>
        <span>${escapeHTML(session.cwd)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">PID</span>
        <span>${session.pid}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">CPU</span>
        <span>
          ${cpuPct}%
          <span class="cpu-bar"><span class="cpu-bar-fill" style="width:${cpuPct}%"></span></span>
        </span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Memory</span>
        <span>${memMB} MB</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Uptime</span>
        <span>${uptime}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Terminal</span>
        <span>${escapeHTML(session.tty || '—')}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Children</span>
        <span>${session.has_children ? 'Yes' : 'No'}</span>
      </div>
      ${session.owner ? `
      <div class="panel-row">
        <span class="panel-row-label">Player</span>
        <span><span class="owner-dot" style="background:${escapeHTML(session.ownerColor || '#60C0F0')}"></span> ${escapeHTML(session.owner)}</span>
      </div>
      ` : ''}
      ${session.mode === 2 ? `
      <div class="panel-divider"></div>
      <div class="panel-row">
        <span class="panel-row-label">Mode</span>
        <span><span class="panel-mode-badge mode-2">Mode 2</span></span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Task</span>
        <span>${escapeHTML(session.context?.task || '')}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Phase</span>
        <span><span class="panel-phase-badge phase-${escapeHTML(session.context?.phase || 'idle')}">${escapeHTML(session.context?.phase || 'unknown')}</span></span>
      </div>
      ${session.context?.detail ? `<div class="panel-row">
        <span class="panel-row-label">Detail</span>
        <span>${escapeHTML(session.context.detail)}</span>
      </div>` : ''}
      ${session.context?.blocked ? `<div class="panel-row">
        <span class="panel-row-label">Status</span>
        <span class="panel-blocked-indicator">BLOCKED</span>
      </div>` : ''}
      ` : `
      <div class="panel-divider"></div>
      <div class="panel-row">
        <span class="panel-row-label">Mode</span>
        <span><span class="panel-mode-badge mode-1">Mode 1 (passive)</span></span>
      </div>
      `}
    `;

    this.el.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // showGroup — display group summary with session list
  // ---------------------------------------------------------------------------

  /**
   * @param {{ id: string, cwd: string, session_count: number, session_ids: string[] }} group
   * @param {Array<{ id: string, state: string, cpu: number, age_seconds: number }>} sessions
   */
  showGroup(group, sessions) {
    const counts = countSessionStates(sessions);

    const sessionRows = sessions.map(s => {
      const age = formatUptime(s.age_seconds);
      const cpu = Math.min(s.cpu, 100).toFixed(1);
      return `
        <div class="group-session-row">
          <span class="state-dot ${s.state}"></span>
          <span class="session-id">${escapeHTML(s.id)}</span>
          <span class="session-state">${s.state}</span>
          <span class="session-cpu">${cpu}%</span>
          <span class="session-age">${age}</span>
        </div>
      `;
    }).join('');

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">${escapeHTML(group.id)}</span>
        <span class="panel-badge">${group.session_count} session${group.session_count !== 1 ? 's' : ''}</span>
      </div>
      ${group.owners ? `<div class="panel-row">
        <span class="panel-row-label">Players</span>
        <span>${group.owners.map(o => `<span class="owner-dot" style="background:${escapeHTML(SelectionPanel._ownerColor(o, sessions))}"></span> ${escapeHTML(o)}`).join(', ')}</span>
      </div>` : ''}
      <div class="panel-row">
        <span class="panel-row-label">Active</span>
        <span>${counts.active}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Awaiting</span>
        <span>${counts.awaiting}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Blocked</span>
        <span>${counts.blocked}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Idle</span>
        <span>${counts.idle}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Stale</span>
        <span>${counts.stale}</span>
      </div>
      <div class="group-session-list">
        ${sessionRows}
      </div>
    `;

    this.el.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // showMultiUnit — display summary for multiple selected units
  // ---------------------------------------------------------------------------

  /**
   * Show a summary panel for multiple selected units (e.g. from box select).
   * @param {Array<{ id: string, state: string, cpu: number, age_seconds: number }>} sessions
   */
  showMultiUnit(sessions) {
    const count = sessions.length;

    const counts = countSessionStates(sessions);
    let totalCpu = 0;
    for (const s of sessions) {
      totalCpu += s.cpu ?? 0;
    }
    const totalCpuPct = Math.min(totalCpu, 9999).toFixed(1);

    const sessionRows = sessions.map(s => {
      const age = formatUptime(s.age_seconds);
      const cpu = Math.min(s.cpu, 100).toFixed(1);
      return `
        <div class="group-session-row">
          <span class="state-dot ${s.state}"></span>
          <span class="session-id">${escapeHTML(s.id)}</span>
          <span class="session-state">${s.state}</span>
          <span class="session-cpu">${cpu}%</span>
          <span class="session-age">${age}</span>
        </div>
      `;
    }).join('');

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">${count} Units Selected</span>
        <span class="panel-badge">${count} unit${count !== 1 ? 's' : ''}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Active</span>
        <span>${counts.active}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Awaiting</span>
        <span>${counts.awaiting}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Blocked</span>
        <span>${counts.blocked}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Idle</span>
        <span>${counts.idle}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Stale</span>
        <span>${counts.stale}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Total CPU</span>
        <span>${totalCpuPct}%</span>
      </div>
      <div class="group-session-list">
        ${sessionRows}
      </div>
    `;

    this.el.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // hide
  // ---------------------------------------------------------------------------

  hide() {
    this.el.classList.add('hidden');
  }

  /**
   * Resolve ownerColor for a given owner name by looking through sessions.
   * @param {string} ownerName
   * @param {object[]} sessions
   * @returns {string}
   */
  static _ownerColor(ownerName, sessions) {
    for (const s of sessions) {
      if (s.owner === ownerName && s.ownerColor) return s.ownerColor;
    }
    return '#60C0F0';
  }

}

export default SelectionPanel;
