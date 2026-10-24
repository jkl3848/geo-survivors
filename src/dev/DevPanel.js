export class DevPanel {
  constructor({ container, getState, actions }) {
    this.getState = getState;
    this.actions = actions;
    this.visible = false;

    this.root = document.createElement("div");
    this.root.style.cssText = [
      "position:absolute",
      "inset:0",
      "z-index:100",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "background:rgba(0,0,0,0.55)",
      "pointer-events:auto",
    ].join(";");

    this.panel = document.createElement("div");
    this.panel.style.cssText = [
      "width:min(480px,92vw)",
      "max-height:85vh",
      "overflow-y:auto",
      "padding:20px",
      "background:#12121f",
      "border:2px solid #5dade2",
      "box-shadow:0 8px 32px rgba(0,0,0,0.5)",
      "display:flex",
      "flex-direction:column",
      "gap:16px",
    ].join(";");
    this.root.appendChild(this.panel);

    const title = document.createElement("h2");
    title.textContent = "DEV MODE";
    title.style.cssText =
      "margin:0;color:#5dade2;font-size:18px;letter-spacing:2px;";
    this.panel.appendChild(title);

    const hint = document.createElement("p");
    hint.textContent = "Press ` to close · Game is paused";
    hint.style.cssText = "margin:0;color:#666;font-size:11px;";
    this.panel.appendChild(hint);

    this._addSection("Upgrades", (section) => {
      this.pathSelect = document.createElement("select");
      this.pathSelect.style.cssText = this._inputStyle();
      for (const [value, label] of [
        ["all", "All paths"],
        ["lightning", "Lightning"],
        ["fire", "Fire"],
        ["frost", "Frost"],
        ["gunner", "Gunner"],
        ["core", "Core"],
      ]) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        this.pathSelect.appendChild(opt);
      }
      this.pathSelect.addEventListener("change", () => this._refresh());
      section.appendChild(this.pathSelect);

      this.upgradeSelect = document.createElement("select");
      this.upgradeSelect.style.cssText = this._inputStyle();
      section.appendChild(this.upgradeSelect);

      this.upgradeStatus = document.createElement("p");
      this.upgradeStatus.style.cssText = "margin:0;color:#888;font-size:11px;";
      section.appendChild(this.upgradeStatus);

      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;";
      row.appendChild(
        this._makeButton("Grant upgrade", () => {
          const id = this.upgradeSelect.value;
          if (id && this.actions.applyUpgrade(id)) {
            this._flashStatus(this.upgradeStatus, "Applied!");
            this._refresh();
          }
        }),
      );
      row.appendChild(
        this._makeButton("Grant 5 from path", () => {
          const tag = this.pathSelect.value;
          if (tag === "all") {
            this._flashStatus(this.upgradeStatus, "Pick a path first");
            return;
          }
          const applied = this.actions.grantRandom?.(tag, 5) || 0;
          this._flashStatus(this.upgradeStatus, `Granted ${applied}`);
          this._refresh();
        }),
      );
      section.appendChild(row);

      this.buildReadout = document.createElement("pre");
      this.buildReadout.style.cssText =
        "margin:0;color:#aed6f1;font-size:11px;white-space:pre-wrap;font-family:inherit;";
      section.appendChild(this.buildReadout);
    });

    this._addSection("Enemy level", (section) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;align-items:center;";

      this.enemyLevelInput = document.createElement("input");
      this.enemyLevelInput.type = "number";
      this.enemyLevelInput.min = "1";
      this.enemyLevelInput.value = "1";
      this.enemyLevelInput.style.cssText = `${this._inputStyle()} width:80px;`;
      row.appendChild(this.enemyLevelInput);

      row.appendChild(
        this._makeButton("Set level", () => {
          const level = parseInt(this.enemyLevelInput.value, 10);
          if (Number.isFinite(level) && level >= 1) {
            this.actions.setEnemyLevel(level);
            this._refresh();
          }
        }),
      );
      section.appendChild(row);

      this.enemyLevelStatus = document.createElement("p");
      this.enemyLevelStatus.style.cssText =
        "margin:0;color:#888;font-size:11px;";
      section.appendChild(this.enemyLevelStatus);
    });

    this._addSection("Spawn boss", (section) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      row.appendChild(
        this._makeButton("Barrage Square", () =>
          this.actions.spawnBoss("boss_square"),
        ),
      );
      row.appendChild(
        this._makeButton("Saw Octagon", () =>
          this.actions.spawnBoss("boss_octagon"),
        ),
      );
      section.appendChild(row);
    });

    this._addSection("Quick actions", (section) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      row.appendChild(
        this._makeButton("Level up", () => {
          this.actions.forceLevelUp();
          this._refresh();
        }),
      );
      row.appendChild(
        this._makeButton("Heal full", () => {
          this.actions.healFull();
          this._refresh();
        }),
      );
      row.appendChild(
        this._makeButton("Kill all enemies", () => {
          this.actions.killAllEnemies();
          this._refresh();
        }),
      );
      section.appendChild(row);
    });

    container.style.position = "relative";
    container.appendChild(this.root);
  }

  _inputStyle() {
    return [
      "padding:8px 10px",
      "background:#1a1a2e",
      "border:1px solid #333",
      "color:#ecf0f1",
      "font-family:inherit",
      "font-size:12px",
    ].join(";");
  }

  _addSection(label, build) {
    const section = document.createElement("div");
    section.style.cssText =
      "display:flex;flex-direction:column;gap:8px;padding-top:4px;border-top:1px solid #222;";

    const heading = document.createElement("p");
    heading.textContent = label;
    heading.style.cssText = "margin:0;color:#ecf0f1;font-size:12px;font-weight:bold;";
    section.appendChild(heading);

    build(section);
    this.panel.appendChild(section);
  }

  _makeButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = [
      "padding:8px 12px",
      "background:#2c3e50",
      "border:1px solid #5dade2",
      "color:#ecf0f1",
      "font-family:inherit",
      "font-size:11px",
      "cursor:pointer",
    ].join(";");
    btn.addEventListener("click", onClick);
    return btn;
  }

  _flashStatus(el, text) {
    el.textContent = text;
    setTimeout(() => this._refresh(), 800);
  }

  _refresh() {
    const state = this.getState();

    const filter = this.pathSelect.value;
    const previous = this.upgradeSelect.value;
    this.upgradeSelect.innerHTML = "";
    for (const upgrade of state.upgrades) {
      if (filter === "core" && upgrade.tags?.length) continue;
      if (
        filter !== "all" &&
        filter !== "core" &&
        !upgrade.tags?.includes(filter)
      ) {
        continue;
      }
      const stacks = state.playerStacks[upgrade.id] || 0;
      const opt = document.createElement("option");
      opt.value = upgrade.id;
      const tags = upgrade.tags?.length ? ` [${upgrade.tags.join("/")}]` : "";
      opt.textContent = `${upgrade.name}${tags}${stacks > 0 ? ` (x${stacks})` : ""}`;
      this.upgradeSelect.appendChild(opt);
    }
    if (previous && [...this.upgradeSelect.options].some((opt) => opt.value === previous)) {
      this.upgradeSelect.value = previous;
    }

    const selectedId = this.upgradeSelect.value;
    const stacks = state.playerStacks[selectedId] || 0;
    this.upgradeStatus.textContent = stacks > 0 ? `Currently owned: x${stacks}` : "";

    this.buildReadout.textContent = (state.buildSummary || []).join("\n");

    this.enemyLevelInput.value = String(state.enemyLevel);
    this.enemyLevelStatus.textContent = `Elapsed: ${state.elapsed.toFixed(1)}s`;
  }

  show() {
    this.visible = true;
    this.root.style.display = "flex";
    this._refresh();
  }

  hide() {
    this.visible = false;
    this.root.style.display = "none";
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  destroy() {
    this.root.remove();
  }
}
