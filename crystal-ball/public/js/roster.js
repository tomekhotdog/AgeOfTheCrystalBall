// roster.js -- Online player roster panel (left side).
// Shows connected users with colored dots, session counts, and "You" indicator.

export class RosterPanel {
  /**
   * @param {{ name: string, color: string }|null} localUser -- current user info
   */
  constructor(localUser) {
    this._localUser = localUser;
    this.el = document.getElementById('roster-panel');
    this._buildDOM();
  }

  _buildDOM() {
    this.el.innerHTML = `
      <div class="roster-header">
        <span class="roster-title">Players</span>
        <button class="roster-close">&times;</button>
      </div>
      <div class="roster-body"></div>
    `;
    this.el.querySelector('.roster-close').addEventListener('click', () => this.hide());
  }

  toggle() {
    if (this.el.classList.contains('hidden')) {
      this.show();
    } else {
      this.hide();
    }
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  /**
   * Update the roster with fresh API data.
   * @param {{ users?: Array<{ name: string, color: string, sessionCount: number }> }} apiData
   */
  update(apiData) {
    if (!apiData.users || apiData.users.length === 0) {
      this.el.classList.add('hidden');
      return;
    }

    const body = this.el.querySelector('.roster-body');
    const localName = this._localUser ? this._localUser.name : null;

    let html = '';
    for (const u of apiData.users) {
      const isSelf = u.name === localName;
      const selfClass = isSelf ? ' roster-self' : '';
      const youTag = isSelf ? ' (you)' : '';
      html += `
        <div class="roster-user-row${selfClass}">
          <span class="owner-dot" style="background:${esc(u.color)}"></span>
          <span class="roster-user-name">${esc(u.name)}${youTag}</span>
          <span class="roster-user-count">${u.sessionCount}</span>
        </div>
      `;
    }

    body.innerHTML = html;
  }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
