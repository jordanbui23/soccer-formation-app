import type { Game, LineupState, Rsvp, RsvpStatus } from '../types';
import { RSVP_STATUSES, STATUS_LABEL, emptyLineup } from '../types';
import { getRepository } from '../data';
import { normalizeHexColor } from '../color';
import { el, formatMatchDateTime } from '../dom';
import { navigate } from '../router';
import { notify, errorMessage } from '../ui/toast';
import { render, statusBanner, topbar } from '../ui/components';
import { reconcileLineup, type YesRsvpRef } from '../lineup';
import { LineupEditor } from '../lineupEditor';

function yesRefs(rsvps: Rsvp[]): YesRsvpRef[] {
  return rsvps.filter((r) => r.status === 'yes').map((r) => ({ id: r.id, name: r.name }));
}

function shareUrl(game: Game): string {
  return `${location.origin}/game/${encodeURIComponent(game.slug)}`;
}

function shareRow(game: Game): HTMLElement {
  const url = shareUrl(game);
  const input = el('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Public game link' });
  const copy = el('button', { type: 'button', class: 'btn-accent' }, ['Copy']);
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(url).then(
      () => notify('Share link copied.'),
      () => notify('Copy failed. Select the link manually.', 'error'),
    );
  });
  const open = el('a', { class: 'btn-ghost', href: `/game/${encodeURIComponent(game.slug)}`, 'data-link': 'true' }, [
    'Open',
  ]);
  return el('div', { class: 'copy-row' }, [input, copy, open]);
}

export async function adminGameDetailPage(gameId: string): Promise<void> {
  const repo = getRepository();
  const session = await repo.getSession();
  if (!session) {
    navigate('/admin');
    return;
  }

  let game: Game | null;
  let rsvps: Rsvp[];
  let storedLineup: LineupState | null;
  try {
    game = await repo.getGameById(gameId);
    if (!game) {
      render(el('main', { class: 'page' }, [el('div', { class: 'empty-state' }, ['Game not found.'])]));
      return;
    }
    rsvps = await repo.listRsvps(gameId);
    storedLineup = await repo.getLineup(gameId);
  } catch (err) {
    notify(errorMessage(err), 'error');
    navigate('/admin');
    return;
  }

  const currentGame = game;
  let currentRsvps = rsvps;

  const initialLineup = reconcileLineup(storedLineup ?? emptyLineup('4-4-2'), yesRefs(currentRsvps));
  await repo.saveLineup(gameId, initialLineup).catch(() => undefined);

  const editor = new LineupEditor({
    game: currentGame,
    initial: initialLineup,
    onSave: (state) => repo.saveLineup(gameId, state),
  });

  const rsvpPanel = el('div', { class: 'card__body section-gap' });

  const refreshLineupFromRsvps = async (): Promise<void> => {
    currentRsvps = await repo.listRsvps(gameId);
    const reconciled = reconcileLineup(editor.getState(), yesRefs(currentRsvps));
    editor.setState(reconciled);
    await repo.saveLineup(gameId, reconciled).catch(() => undefined);
    renderRsvpPanel();
  };

  function rsvpRow(rsvp: Rsvp): HTMLElement {
    const nameInput = el('input', { type: 'text', value: rsvp.name, maxLength: 40, 'aria-label': `Name for ${rsvp.name}` });
    const statusSelect = el('select', { 'aria-label': `Status for ${rsvp.name}` });
    for (const status of RSVP_STATUSES) {
      statusSelect.append(el('option', { value: status, selected: status === rsvp.status }, [STATUS_LABEL[status]]));
    }
    const saveBtn = el('button', { type: 'button', class: 'btn-ghost btn-sm' }, ['Save']);
    const delBtn = el('button', { type: 'button', class: 'btn-danger btn-sm', 'aria-label': `Delete ${rsvp.name}` }, ['×']);

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        notify('Name cannot be empty.', 'error');
        return;
      }
      void (async () => {
        saveBtn.setAttribute('aria-busy', 'true');
        try {
          await repo.updateRsvpAdmin(rsvp.id, name, statusSelect.value as RsvpStatus);
          notify('RSVP updated.');
          await refreshLineupFromRsvps();
        } catch (err) {
          notify(errorMessage(err), 'error');
        } finally {
          saveBtn.removeAttribute('aria-busy');
        }
      })();
    });

    delBtn.addEventListener('click', () => {
      if (!window.confirm(`Delete ${rsvp.name}'s RSVP?`)) return;
      void (async () => {
        try {
          await repo.deleteRsvpAdmin(rsvp.id);
          notify('RSVP deleted.');
          await refreshLineupFromRsvps();
        } catch (err) {
          notify(errorMessage(err), 'error');
        }
      })();
    });

    return el('li', { class: `is-${rsvp.status}` }, [
      el('div', { style: 'flex:1;min-width:0;display:grid;gap:6px;' }, [
        el('div', { class: 'form-row' }, [nameInput, el('div', { style: 'flex:0 0 110px;' }, [statusSelect])]),
      ]),
      el('div', { class: 'r-actions' }, [saveBtn, delBtn]),
    ]);
  }

  function renderRsvpPanel(): void {
    const counts = { yes: 0, maybe: 0, no: 0 } as Record<RsvpStatus, number>;
    for (const r of currentRsvps) counts[r.status] += 1;
    const list = el('ul', { class: 'roster' });
    if (currentRsvps.length === 0) {
      list.append(el('li', { style: 'border-left-color:transparent;color:#8a8f9c;' }, ['No RSVPs yet.']));
    } else {
      for (const r of currentRsvps) list.append(rsvpRow(r));
    }
    rsvpPanel.replaceChildren(
      el('h2', { class: 'card__title' }, ['RSVPs']),
      el('p', { class: 'starter-count' }, [`${counts.yes} in · ${counts.maybe} maybe · ${counts.no} out`]),
      el('div', { class: 'msg msg--info' }, ['Players who reply "Yes" are added to the bench automatically.']),
      list,
    );
  }
  renderRsvpPanel();

  const fixtureHost = el('div', { class: 'card__body section-gap' });

  function fixtureEditForm(): HTMLElement {
    const opponent = el('input', { type: 'text', id: 'ge-opp', maxLength: 40, required: true, value: currentGame.opponent });
    const date = el('input', { type: 'date', id: 'ge-date', required: true, value: currentGame.matchDate });
    const time = el('input', { type: 'time', id: 'ge-time', value: currentGame.matchTime });
    const venue = el('input', { type: 'text', id: 'ge-venue', maxLength: 60, value: currentGame.venue });
    const color = el('input', { type: 'color', id: 'ge-color', value: normalizeHexColor(currentGame.teamColor) });
    const save = el('button', { type: 'submit', class: 'btn-accent' }, ['Save changes']);

    const form = el('form', { class: 'section-gap', novalidate: true }, [
      el('h2', { class: 'card__title' }, ['Edit fixture']),
      el('div', { class: 'form-grid' }, [
        el('div', { class: 'field-group' }, [el('label', { for: 'ge-opp' }, ['Opponent']), opponent]),
        el('div', { class: 'field-group' }, [el('label', { for: 'ge-date' }, ['Date']), date]),
        el('div', { class: 'field-group' }, [el('label', { for: 'ge-time' }, ['Kickoff']), time]),
        el('div', { class: 'field-group' }, [el('label', { for: 'ge-venue' }, ['Venue']), venue]),
        el('div', { class: 'field-group' }, [el('label', { for: 'ge-color' }, ['Team color']), color]),
      ]),
      save,
    ]);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!opponent.value.trim() || !date.value) {
        notify('Opponent and date are required.', 'error');
        return;
      }
      void (async () => {
        save.setAttribute('aria-busy', 'true');
        save.disabled = true;
        try {
          const updated = await repo.updateGame(currentGame.id, {
            opponent: opponent.value,
            matchDate: date.value,
            matchTime: time.value,
            venue: venue.value,
            teamColor: color.value,
          });
          currentGame.opponent = updated.opponent;
          currentGame.matchDate = updated.matchDate;
          currentGame.matchTime = updated.matchTime;
          currentGame.venue = updated.venue;
          currentGame.teamColor = updated.teamColor;
          editor.setGame(updated);
          renderFixture();
          notify('Fixture updated.');
        } catch (err) {
          notify(errorMessage(err), 'error');
        } finally {
          save.removeAttribute('aria-busy');
          save.disabled = false;
        }
      })();
    });

    return form;
  }

  function renderFixture(): void {
    const teamColor = normalizeHexColor(currentGame.teamColor);

    const banner = statusBanner(currentGame.isOpen);
    const toggleBtn = el('button', { type: 'button', class: currentGame.isOpen ? 'btn-danger' : 'btn-accent' }, [
      currentGame.isOpen ? 'Close RSVPs' : 'Reopen RSVPs',
    ]);
    toggleBtn.addEventListener('click', () => {
      void (async () => {
        toggleBtn.setAttribute('aria-busy', 'true');
        toggleBtn.disabled = true;
        try {
          const updated = await repo.setGameOpen(currentGame.id, !currentGame.isOpen);
          currentGame.isOpen = updated.isOpen;
          renderFixture();
          notify(currentGame.isOpen ? 'RSVPs reopened.' : 'RSVPs closed.');
        } catch (err) {
          notify(errorMessage(err), 'error');
          toggleBtn.removeAttribute('aria-busy');
          toggleBtn.disabled = false;
        }
      })();
    });

    fixtureHost.replaceChildren(
      el('span', { class: 'fixture-accent', 'aria-hidden': 'true', style: `--team-color:${teamColor};` }),
      el('p', { class: 'eyebrow' }, ['Fixture']),
      el('div', { class: 'fixture-headline' }, [
        el('span', { class: 'kit-swatch kit-swatch--lg', style: `background:${teamColor};`, 'aria-hidden': 'true' }),
        el('h1', { class: 'card__title', style: 'font-size:1.7rem;' }, [`Our XI vs ${currentGame.opponent}`]),
      ]),
      el('p', { class: 'starter-count' }, [
        `${formatMatchDateTime(currentGame.matchDate, currentGame.matchTime) || 'Date TBD'} · ${currentGame.venue || 'Venue TBD'}`,
      ]),
      el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;' }, [banner, toggleBtn]),
      el('div', { class: 'field-group' }, [el('label', {}, ['Share link (Messenger)']), shareRow(currentGame)]),
      fixtureEditForm(),
    );
  }
  renderFixture();

  const actions = el('div', { class: 'topbar-actions' }, [
    el('a', { class: 'btn-ghost btn-sm', href: '/admin', 'data-link': 'true' }, ['← Games']),
    el('span', { class: 'who' }, [session.email]),
  ]);

  render(
    el('div', {}, [
      topbar(actions),
      el('main', { class: 'page', id: 'main' }, [
        el('section', { class: 'card', style: 'margin-bottom:24px;' }, [fixtureHost]),
        el('div', { class: 'detail-grid' }, [
          el('section', { class: 'card' }, [rsvpPanel]),
          el('section', {}, [editor.element]),
        ]),
      ]),
    ]),
  );
}
