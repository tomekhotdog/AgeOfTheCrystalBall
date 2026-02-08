// sharingPanel.js -- Sharing settings popover.
// Toggle sharing on/off and exclude specific projects from being published.

export class SharingPanel {
  /**
   * @param {string} mode -- 'local' or 'multi'
   */
  constructor(mode) {
    this._mode = mode;
    this._settings = { enabled: false, excludedGroups: [] };
    this._saveTimer = null;
    this._groups = [];

    // Only create if we have multi-person mode
    this.el = document.createElement('div');
    this.el.className = 'sharing-panel hidden';
    this.el.id = 'sharing-panel';
    document.body.appendChild(this.el);

    // Wire the gear button
    const btn = document.getElementById('sharing-toggle-btn');
    if (btn && mode === 'multi') {
      btn.style.display = '';
      btn.addEventListener('click', () => this.toggle());
    }

    if (mode === 'multi') {
      this._loadSettings();
    }
  }

  toggle() {
    this.el.classList.toggle('hidden');
    if (!this.el.classList.contains('hidden')) {
      this._render();
    }
  }

  show() { this.el.classList.remove('hidden'); this._render(); }
  hide() { this.el.classList.add('hidden'); }

  /**
   * Update the known groups list from API data.
   * @param {{ groups?: Array<{ id: string }> }} apiData
   */
  updateGroups(apiData) {
    this._groups = (apiData.groups || []).map(g => g.id);
  }

  async _loadSettings() {
    try {
      const res = await fetch('/api/sharing');
      if (res.ok) {
        this._settings = await res.json();
      }
    } catch {
      // Use defaults
    }
  }

  _render() {
    const isConnected = this._mode === 'multi';
    const statusClass = isConnected ? 'connected' : '';
    const statusText = isConnected ? 'Connected to relay' : 'Local only';

    const excludeSet = new Set(this._settings.excludedGroups || []);

    const projectItems = this._groups.map(g => {
      const checked = !excludeSet.has(g) ? 'checked' : '';
      return `<label><input type="checkbox" data-group="${esc(g)}" ${checked}> ${esc(g)}</label>`;
    }).join('');

    this.el.innerHTML = `
      <div class="sharing-panel-title">Sharing</div>
      <div class="sharing-status">
        <span class="sharing-status-dot ${statusClass}"></span>
        <span>${statusText}</span>
      </div>
      <div class="sharing-toggle">
        <span>Share my sessions</span>
        <div class="sharing-switch ${this._settings.enabled ? 'on' : ''}" id="sharing-switch"></div>
      </div>
      ${projectItems ? `
      <div style="opacity:0.6;margin-bottom:4px;">Projects to share:</div>
      <div class="sharing-project-list">${projectItems}</div>
      ` : ''}
    `;

    // Wire toggle
    const sw = this.el.querySelector('#sharing-switch');
    if (sw) {
      sw.addEventListener('click', () => {
        this._settings.enabled = !this._settings.enabled;
        sw.classList.toggle('on', this._settings.enabled);
        this._debouncedSave();
      });
    }

    // Wire project checkboxes
    for (const cb of this.el.querySelectorAll('input[type="checkbox"]')) {
      cb.addEventListener('change', (e) => {
        const group = e.target.dataset.group;
        if (e.target.checked) {
          this._settings.excludedGroups = (this._settings.excludedGroups || []).filter(g => g !== group);
        } else {
          if (!this._settings.excludedGroups) this._settings.excludedGroups = [];
          this._settings.excludedGroups.push(group);
        }
        this._debouncedSave();
      });
    }
  }

  _debouncedSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 500);
  }

  async _save() {
    try {
      await fetch('/api/sharing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._settings),
      });
    } catch {
      console.warn('[SharingPanel] save failed');
    }
  }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
