function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export class MetaMenu {
  constructor({ meta, colors, upgrades, onChange }) {
    this.meta = meta;
    this.colors = colors;
    this.upgrades = upgrades;
    this.onChange = onChange;
    this.tab = 'shop';
    this.root = null;
    this._onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    };
  }

  open(tab = 'shop') {
    this.tab = tab;
    if (!this.root) this._build();
    this._render();
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this._onKey);
  }

  close() {
    window.removeEventListener('keydown', this._onKey);
    this.root?.remove();
  }

  _build() {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:40',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.72)',
      'padding:24px',
    ].join(';');

    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'width:min(560px,100%)',
      'max-height:min(640px,100%)',
      'overflow:auto',
      'background:#12121f',
      'border:2px solid #5dade2',
      'padding:20px',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
    ].join(';');
    this.root.appendChild(this.panel);
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
  }

  _render() {
    this.panel.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
    const title = document.createElement('h2');
    title.textContent = 'PROGRESS';
    title.style.cssText = 'margin:0;color:#5dade2;font-size:18px;letter-spacing:2px;';
    const shards = document.createElement('span');
    shards.textContent = `${this.meta.getShards()} shards`;
    shards.style.cssText = 'color:#f1c40f;font-size:13px;';
    header.append(title, shards);
    this.panel.appendChild(header);

    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:8px;';
    for (const [id, label] of [
      ['shop', 'Upgrades'],
      ['achievements', 'Achievements'],
      ['records', 'Records'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      const active = this.tab === id;
      button.style.cssText = [
        'padding:8px 12px',
        'font-family:inherit',
        'font-size:12px',
        'cursor:pointer',
        `background:${active ? '#1a5276' : '#1a1a2e'}`,
        `color:${active ? '#fff' : '#aaa'}`,
        `border:1px solid ${active ? '#5dade2' : '#333'}`,
      ].join(';');
      button.addEventListener('click', () => {
        this.tab = id;
        this._render();
      });
      tabs.appendChild(button);
    }
    this.panel.appendChild(tabs);

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    if (this.tab === 'shop') this._renderShop(body);
    else if (this.tab === 'achievements') this._renderAchievements(body);
    else this._renderRecords(body);
    this.panel.appendChild(body);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset progress';
    reset.style.cssText = 'padding:8px 12px;font-family:inherit;font-size:11px;cursor:pointer;background:#3b1d1d;color:#e74c3c;border:1px solid #e74c3c;';
    reset.addEventListener('click', () => {
      if (!window.confirm('Erase all saved progress?')) return;
      this.meta.reset();
      this.onChange?.('reset');
      this._render();
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'padding:8px 16px;font-family:inherit;font-size:12px;cursor:pointer;background:#2c3e50;color:#ecf0f1;border:1px solid #5dade2;';
    close.addEventListener('click', () => this.close());
    footer.append(reset, close);
    this.panel.appendChild(footer);
  }

  _renderShop(body) {
    const note = document.createElement('p');
    note.textContent = 'Purchases apply to the next run.';
    note.style.cssText = 'margin:0;color:#888;font-size:11px;';
    body.appendChild(note);

    for (const item of this.meta.config.shop) {
      const level = this.meta.getPerk(item.id);
      const cost = this.meta.nextCost(item.id);
      const card = document.createElement('div');
      card.style.cssText = 'padding:12px;border:1px solid #333;background:#1a1a2e;display:flex;flex-direction:column;gap:6px;';

      const name = document.createElement('div');
      name.style.cssText = 'display:flex;justify-content:space-between;gap:8px;color:#ecf0f1;font-size:13px;';
      name.innerHTML = `<strong>${item.name}</strong><span style="color:#888">Lv ${level}/${item.maxLevel}</span>`;

      const description = document.createElement('p');
      description.textContent = item.description;
      description.style.cssText = 'margin:0;color:#aaa;font-size:12px;';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end;';
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.textContent = cost == null ? 'Owned' : `Buy · ${cost} shards`;
      buy.disabled = cost == null || this.meta.getShards() < cost;
      buy.style.cssText = [
        'padding:8px 12px',
        'font-family:inherit',
        'font-size:12px',
        `cursor:${buy.disabled ? 'default' : 'pointer'}`,
        `background:${buy.disabled ? '#222' : '#1a5276'}`,
        `color:${buy.disabled ? '#666' : '#fff'}`,
        'border:1px solid #5dade2',
      ].join(';');
      buy.addEventListener('click', () => {
        const result = this.meta.buy(item.id);
        if (!result.ok) return;
        this.onChange?.('buy');
        this._render();
      });
      row.appendChild(buy);

      card.append(name, description, row);
      body.appendChild(card);
    }
  }

  _renderAchievements(body) {
    const hidden = this._hiddenUpgrades();
    for (const achievement of this.meta.config.achievements) {
      const earned = !!this.meta.save.achievements[achievement.id];
      const card = document.createElement('div');
      card.style.cssText = `padding:12px;border:1px solid ${earned ? '#1a5276' : '#333'};background:#1a1a2e;display:flex;flex-direction:column;gap:4px;`;

      const name = document.createElement('strong');
      name.textContent = earned ? achievement.name : '???';
      name.style.cssText = `color:${earned ? '#f1c40f' : '#888'};font-size:13px;`;

      const hint = document.createElement('p');
      hint.textContent = achievement.hint;
      hint.style.cssText = 'margin:0;color:#aaa;font-size:12px;';

      card.append(name, hint);

      const rewards = this._rewardLines(achievement, hidden, earned);
      if (rewards.length) {
        const reward = document.createElement('p');
        reward.textContent = rewards.join(' · ');
        reward.style.cssText = 'margin:0;color:#5dade2;font-size:11px;';
        card.appendChild(reward);
      }
      body.appendChild(card);
    }
  }

  _hiddenUpgrades() {
    const pools = [
      ...(this.upgrades.pool || []),
      ...(this.upgrades.specialPool || []),
      ...(this.upgrades.bossDropPool || []),
    ];
    return pools.filter((upgrade) => upgrade.unlockedBy);
  }

  _rewardLines(achievement, hidden, earned) {
    const lines = [];
    const reward = achievement.reward || {};
    if (reward.shards) lines.push(`+${reward.shards} shards`);
    for (const colorId of reward.colors || []) {
      const color = this.colors.find((entry) => entry.id === colorId);
      lines.push(earned && color ? `${color.name} color` : 'A color');
    }
    if (reward.difficulty) lines.push(earned ? 'Hard mode' : 'A difficulty');
    for (const upgrade of hidden) {
      if (upgrade.unlockedBy !== achievement.id) continue;
      lines.push(earned ? upgrade.name : '???');
    }
    return lines;
  }

  _renderRecords(body) {
    const records = this.meta.save.records;
    const rows = [
      ['Runs', records.runs],
      ['Wins', records.wins],
      ['Hard wins', records.hardWins],
      ['Best time', formatTime(records.bestTime)],
      ['Best level', records.bestLevel],
      ['Enemies defeated', records.totalKills],
      ['Bosses defeated', records.bossKills],
    ];
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #222;font-size:13px;';
      const name = document.createElement('span');
      name.textContent = label;
      name.style.color = '#888';
      const amount = document.createElement('span');
      amount.textContent = String(value);
      amount.style.color = '#ecf0f1';
      row.append(name, amount);
      body.appendChild(row);
    }
  }
}
