import type { LineupPlayer, LineupState, Game } from './types';
import {
  ALL_POSITIONS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FORMATION_NAMES,
  FORMATIONS,
  assignSlots,
  positionGroup,
} from './formations';
import {
  MAX_STARTERS,
  addManualPlayer,
  changePosition,
  countStarters,
  getStarters,
  getSubs,
  removePlayer,
  setCustomPosition,
  setFormation,
  swapSlots,
  toggleStarter,
} from './lineup';
import { createPitchSvg } from './field';
import { el, clear } from './dom';
import { notify, errorMessage } from './ui/toast';
import { exportPdf, exportPng } from './export';
import { foregroundFor, isDarkColor, normalizeHexColor } from './color';
import { fieldLabels } from './rsvpName';

const GROUP_CLASS: Record<string, string> = { GK: 'gk', DEF: 'def', MID: 'mid', FWD: 'fwd' };
const SWAP_THRESHOLD = 55;
const NUDGE_STEP = 12;

interface SlotPos {
  id: string;
  x: number;
  y: number;
  slotIdx: number;
}

export interface LineupEditorOptions {
  game: Game;
  initial: LineupState;
  onSave: (state: LineupState) => Promise<void>;
}

export class LineupEditor {
  private state: LineupState;
  private game: Game;
  private readonly onSave: (state: LineupState) => Promise<void>;
  private root: HTMLElement;
  private pitchWrap!: HTMLElement;
  private poolHost!: HTMLElement;
  private legendHost!: HTMLElement;
  private statusEl!: HTMLElement;
  private saveTimer: number | null = null;

  constructor(options: LineupEditorOptions) {
    this.state = options.initial;
    this.game = options.game;
    this.onSave = options.onSave;
    this.root = el('div', { class: 'editor' });
    this.build();
  }

  get element(): HTMLElement {
    return this.root;
  }

  getState(): LineupState {
    return this.state;
  }

  setState(next: LineupState): void {
    this.state = next;
    this.renderPool();
    this.renderField();
  }

  setGame(game: Game): void {
    this.game = game;
    this.renderLegend();
    this.renderField();
  }

  private commit(next: LineupState): void {
    this.state = next;
    this.renderPool();
    this.renderField();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    this.setStatus('Saving…');
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void this.flushSave();
    }, 500);
  }

  private async flushSave(): Promise<void> {
    try {
      await this.onSave(this.state);
      this.setStatus('All changes saved');
    } catch (err) {
      this.setStatus('Save failed');
      notify(errorMessage(err), 'error');
    }
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  private build(): void {
    const controls = el('div', { class: 'card' }, [
      el('div', { class: 'card__body pool' }, [
        this.buildFormationControl(),
        (this.legendHost = el('div', { class: 'legend' })),
        this.buildAddPlayer(),
        (this.poolHost = el('div', { class: 'section-gap' })),
        this.buildExportControls(),
        (this.statusEl = el('p', { class: 'starter-count', role: 'status', 'aria-live': 'polite' }, [
          'All changes saved',
        ])),
      ]),
    ]);

    const board = el('div', { class: 'card' }, [
      el('div', { class: 'card__body' }, [
        el('h2', { class: 'card__title' }, ['Tactics board']),
        el('p', { class: 'starter-count', style: 'margin-bottom:12px;' }, [
          'Drag a player to reposition. Drop onto a teammate to swap. Focus a token and use arrow keys to nudge.',
        ]),
        (this.pitchWrap = el('div', { class: 'pitch-wrap' })),
      ]),
    ]);

    this.pitchWrap.append(createPitchSvg());
    clear(this.root);
    this.root.append(controls, board);
    this.renderLegend();
    this.renderPool();
    this.renderField();
  }

  private buildFormationControl(): HTMLElement {
    const select = el('select', { id: 'formation-select', 'aria-label': 'Formation' });
    for (const name of FORMATION_NAMES) {
      select.append(el('option', { value: name, selected: name === this.state.formation }, [name]));
    }
    select.addEventListener('change', () => {
      this.commit(setFormation(this.state, select.value));
    });
    return el('div', { class: 'field-group' }, [
      el('label', { for: 'formation-select' }, ['Formation']),
      select,
    ]);
  }

  private renderLegend(): void {
    const teamColor = normalizeHexColor(this.game.teamColor);
    clear(this.legendHost);
    this.legendHost.append(
      el('span', {}, [el('span', { class: 'dot dot-gk', 'aria-hidden': 'true' }), 'Goalkeeper']),
      el('span', {}, [
        el('span', { class: 'dot dot--kit', style: `background:${teamColor};`, 'aria-hidden': 'true' }),
        'Team kit',
      ]),
    );
  }

  private buildAddPlayer(): HTMLElement {
    const nameInput = el('input', {
      type: 'text',
      id: 'manual-name',
      placeholder: 'Add a player',
      maxLength: 40,
      autocomplete: 'off',
    });
    const posSelect = el('select', { id: 'manual-pos', 'aria-label': 'Position' });
    for (const pos of ALL_POSITIONS) posSelect.append(el('option', { value: pos }, [pos]));
    posSelect.value = 'CM';

    const submit = () => {
      const next = addManualPlayer(this.state, nameInput.value, posSelect.value);
      if (next === this.state) {
        notify('Enter a name between 1 and 40 characters.', 'error');
        return;
      }
      this.commit(next);
      nameInput.value = '';
      nameInput.focus();
    };

    const addBtn = el('button', { type: 'button', class: 'btn-accent' }, ['Add']);
    addBtn.addEventListener('click', submit);
    nameInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit();
    });

    return el('div', { class: 'field-group' }, [
      el('label', { for: 'manual-name' }, ['Manual player']),
      el('div', { class: 'form-row' }, [
        nameInput,
        el('div', { style: 'flex:0 0 84px;' }, [posSelect]),
        el('div', { style: 'flex:0 0 auto;' }, [addBtn]),
      ]),
    ]);
  }

  private buildExportControls(): HTMLElement {
    const png = el('button', { type: 'button', class: 'btn-ghost btn-block' }, ['Export PNG']);
    const pdf = el('button', { type: 'button', class: 'btn-ghost btn-block' }, ['Export PDF']);
    png.addEventListener('click', () => void this.runExport(png, () => exportPng(this.game, this.state)));
    pdf.addEventListener('click', () => void this.runExport(pdf, () => exportPdf(this.game, this.state)));
    return el('div', { class: 'field-group' }, [
      el('label', {}, ['Export lineup']),
      el('div', { style: 'display:grid;gap:8px;' }, [png, pdf]),
    ]);
  }

  private async runExport(btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> {
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    }
  }

  private posSelect(player: LineupPlayer): HTMLSelectElement {
    const select = el('select', { 'aria-label': `Position for ${player.name}` });
    for (const pos of ALL_POSITIONS) {
      select.append(el('option', { value: pos, selected: pos === player.pos }, [pos]));
    }
    select.addEventListener('change', () => {
      this.commit(changePosition(this.state, player.id, select.value));
    });
    return select;
  }

  private playerRow(player: LineupPlayer, action: 'start' | 'sub'): HTMLElement {
    const group = positionGroup(player.pos);
    const nameSpan = el('span', { class: 'p-name' }, [player.name]);
    if (!player.manual) nameSpan.title = 'From confirmed RSVP';

    const toggleBtn = el('button', {
      type: 'button',
      class: 'btn-ghost',
      title: action === 'start' ? 'Move to starters' : 'Move to bench',
    }, [action === 'start' ? '▲ Start' : '▼ Bench']);
    toggleBtn.addEventListener('click', () => {
      const next = toggleStarter(this.state, player.id);
      if (next === this.state && action === 'start') {
        notify(`Starting XI is full (${MAX_STARTERS}).`, 'error');
        return;
      }
      this.commit(next);
    });

    const children: (HTMLElement | false)[] = [
      nameSpan,
      this.posSelect(player),
      toggleBtn,
    ];
    if (player.manual) {
      const removeBtn = el('button', {
        type: 'button',
        class: 'btn-danger',
        'aria-label': `Remove ${player.name}`,
      }, ['×']);
      removeBtn.addEventListener('click', () => this.commit(removePlayer(this.state, player.id)));
      children.push(removeBtn);
    }
    return el('li', { class: `grp-${GROUP_CLASS[group]}` }, children);
  }

  private renderPool(): void {
    const starters = getStarters(this.state);
    const subs = getSubs(this.state);
    const count = countStarters(this.state);

    const startersList = el('ul', { class: 'pool-list' });
    if (starters.length === 0) {
      startersList.append(el('li', { style: 'border-left-color:transparent;color:#8a8f9c;' }, ['No starters yet.']));
    }
    for (const p of starters) startersList.append(this.playerRow(p, 'sub'));

    const subGroups = el('div', { class: 'section-gap' });
    const grouped: Record<string, LineupPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of subs) grouped[positionGroup(p.pos)].push(p);
    let anySub = false;
    for (const g of ['GK', 'DEF', 'MID', 'FWD']) {
      if (grouped[g].length === 0) continue;
      anySub = true;
      const list = el('ul', { class: 'pool-list' });
      for (const p of grouped[g]) list.append(this.playerRow(p, 'start'));
      subGroups.append(el('div', { class: 'rsvp-group' }, [
        el('h3', {}, [g, el('span', { class: 'count' }, [String(grouped[g].length)])]),
        list,
      ]));
    }
    if (!anySub) {
      subGroups.append(el('p', { class: 'starter-count' }, ['Confirmed players appear here as substitutes.']));
    }

    clear(this.poolHost);
    const countClass = count >= MAX_STARTERS ? 'starter-count is-full' : 'starter-count';
    this.poolHost.append(
      el('div', {}, [
        el('h2', { class: 'card__title' }, ['Starting XI']),
        el('p', { class: countClass }, [`${count} of ${MAX_STARTERS} selected`]),
        startersList,
      ]),
      el('div', {}, [el('h2', { class: 'card__title' }, ['Substitutes']), subGroups]),
    );
  }

  private slotPositions(starters: LineupPlayer[]): SlotPos[] {
    const formation = FORMATIONS[this.state.formation] ?? FORMATIONS['4-4-2'];
    const slots = assignSlots(this.state.formation, starters, this.state.slotOverrides);
    return starters.map((player, i) => {
      const slotIdx = slots[i] ?? i;
      const base = formation.coords[slotIdx] ?? [FIELD_WIDTH / 2, FIELD_HEIGHT / 2];
      const custom = this.state.customPositions[player.id];
      return {
        id: player.id,
        slotIdx,
        x: custom ? custom.x : base[0],
        y: custom ? custom.y : base[1],
      };
    });
  }

  private renderField(): void {
    this.pitchWrap.querySelectorAll('.token').forEach((n) => n.remove());
    const starters = getStarters(this.state);
    const positions = this.slotPositions(starters);
    const labels = fieldLabels(starters.map((p) => p.name));
    const teamColor = normalizeHexColor(this.game.teamColor);
    const teamText = foregroundFor(teamColor);
    const darkKit = isDarkColor(teamColor);

    starters.forEach((player, i) => {
      const pos = positions[i];
      const isGk = positionGroup(player.pos) === 'GK';
      const kitClass = isGk ? 'gk' : darkKit ? 'token--kit-dark' : 'token--kit-light';
      const token = el('div', {
        class: `token ${kitClass}`,
        role: 'button',
        tabindex: 0,
        'aria-label': `${player.name}, ${player.pos}. Drag or use arrow keys to reposition.`,
      }, [el('span', { class: 'token-name' }, [labels[i]])]);
      if (!isGk) {
        token.style.background = teamColor;
        token.style.color = teamText;
      }
      token.style.left = `${(pos.x / FIELD_WIDTH) * 100}%`;
      token.style.top = `${(pos.y / FIELD_HEIGHT) * 100}%`;
      token.dataset.playerId = player.id;
      this.attachDrag(token, player.id);
      this.attachKeyboard(token, player.id);
      this.pitchWrap.append(token);
    });
  }

  private fieldPointToUnits(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.pitchWrap.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * FIELD_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * FIELD_HEIGHT;
    return {
      x: Math.max(22, Math.min(FIELD_WIDTH - 22, x)),
      y: Math.max(22, Math.min(FIELD_HEIGHT - 22, y)),
    };
  }

  private attachDrag(token: HTMLElement, playerId: string): void {
    let dragging = false;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      token.classList.add('dragging');
      token.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      moved = true;
      const { x, y } = this.fieldPointToUnits(e.clientX, e.clientY);
      token.style.left = `${(x / FIELD_WIDTH) * 100}%`;
      token.style.top = `${(y / FIELD_HEIGHT) * 100}%`;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      token.classList.remove('dragging');
      try {
        token.releasePointerCapture(e.pointerId);
      } catch {
        void 0;
      }
      if (!moved) return;
      const drop = this.fieldPointToUnits(e.clientX, e.clientY);
      this.resolveDrop(playerId, drop.x, drop.y);
    };

    token.addEventListener('pointerdown', onDown);
    token.addEventListener('pointermove', onMove);
    token.addEventListener('pointerup', onUp);
    token.addEventListener('pointercancel', () => {
      dragging = false;
      token.classList.remove('dragging');
    });
  }

  private attachKeyboard(token: HTMLElement, playerId: string): void {
    token.addEventListener('keydown', (ev) => {
      const e = ev as KeyboardEvent;
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, -NUDGE_STEP],
        ArrowDown: [0, NUDGE_STEP],
        ArrowLeft: [-NUDGE_STEP, 0],
        ArrowRight: [NUDGE_STEP, 0],
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      const starters = getStarters(this.state);
      const positions = this.slotPositions(starters);
      const current = positions.find((p) => p.id === playerId);
      if (!current) return;
      const x = Math.max(22, Math.min(FIELD_WIDTH - 22, current.x + delta[0]));
      const y = Math.max(22, Math.min(FIELD_HEIGHT - 22, current.y + delta[1]));
      this.commit(setCustomPosition(this.state, playerId, { x, y }));
      window.requestAnimationFrame(() => {
        const next = this.pitchWrap.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"]`);
        next?.focus();
      });
    });
  }

  private resolveDrop(playerId: string, dropX: number, dropY: number): void {
    const starters = getStarters(this.state);
    const positions = this.slotPositions(starters);
    const dragged = positions.find((p) => p.id === playerId);
    if (!dragged) return;

    let closest: SlotPos | null = null;
    let closestDist = Infinity;
    for (const pos of positions) {
      if (pos.id === playerId) continue;
      const dist = Math.hypot(dropX - pos.x, dropY - pos.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pos;
      }
    }

    if (closest && closestDist < SWAP_THRESHOLD) {
      this.commit(swapSlots(this.state, playerId, dragged.slotIdx, closest.id, closest.slotIdx));
    } else {
      this.commit(setCustomPosition(this.state, playerId, { x: dropX, y: dropY }));
    }
  }
}
