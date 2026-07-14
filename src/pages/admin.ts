import type { AdminSession, Game } from '../types';
import { getRepository } from '../data';
import { el, formatMatchDateTime } from '../dom';
import { navigate } from '../router';
import { notify, errorMessage } from '../ui/toast';
import { render, statusBanner, topbar } from '../ui/components';

function signOutButton(): HTMLElement {
  const btn = el('button', { type: 'button', class: 'btn-ghost btn-sm' }, ['Sign out']);
  btn.addEventListener('click', () => {
    void getRepository()
      .signOut()
      .then(() => navigate('/admin'));
  });
  return btn;
}

function loginView(): HTMLElement {
  const repo = getRepository();
  const emailInput = el('input', { type: 'email', id: 'admin-email', autocomplete: 'username', required: true });
  const passInput = el('input', {
    type: 'password',
    id: 'admin-pass',
    autocomplete: 'current-password',
    required: true,
  });
  const submit = el('button', { type: 'submit', class: 'btn-accent btn-block' }, ['Sign in']);

  if (repo.demoCredentials) {
    emailInput.value = repo.demoCredentials.email;
    passInput.value = repo.demoCredentials.password;
  }

  const form = el('form', { class: 'section-gap', novalidate: true }, [
    el('div', { class: 'field-group' }, [el('label', { for: 'admin-email' }, ['Email']), emailInput]),
    el('div', { class: 'field-group' }, [el('label', { for: 'admin-pass' }, ['Password']), passInput]),
    submit,
  ]);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      try {
        await repo.signIn(emailInput.value, passInput.value);
        navigate('/admin');
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        submit.removeAttribute('aria-busy');
        submit.disabled = false;
      }
    })();
  });

  const demoNote = repo.demoCredentials
    ? el('div', { class: 'msg msg--info' }, [
        el('strong', {}, ['Demo mode — not production security. ']),
        `Signed-in with seeded credentials: ${repo.demoCredentials.email} / ${repo.demoCredentials.password}. Data is stored only in this browser.`,
      ])
    : null;

  return el('main', { class: 'page page--narrow', id: 'main' }, [
    el('div', { class: 'card', style: 'margin-top:32px;' }, [
      el('div', { class: 'card__body section-gap' }, [
        el('p', { class: 'eyebrow' }, ['Organizer access']),
        el('h1', { class: 'card__title' }, ['Admin sign in']),
        demoNote,
        form,
      ]),
    ]),
  ]);
}

function createGameForm(onCreated: () => void): HTMLElement {
  const opponent = el('input', { type: 'text', id: 'g-opp', required: true, maxLength: 40, placeholder: 'Opponent' });
  const date = el('input', { type: 'date', id: 'g-date', required: true });
  const time = el('input', { type: 'time', id: 'g-time' });
  const venue = el('input', { type: 'text', id: 'g-venue', maxLength: 60, placeholder: 'Venue' });
  const submit = el('button', { type: 'submit', class: 'btn-accent' }, ['Create game']);

  const form = el('form', { novalidate: true }, [
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field-group' }, [el('label', { for: 'g-opp' }, ['Opponent']), opponent]),
      el('div', { class: 'field-group' }, [el('label', { for: 'g-date' }, ['Date']), date]),
      el('div', { class: 'field-group' }, [el('label', { for: 'g-time' }, ['Kickoff']), time]),
      el('div', { class: 'field-group' }, [el('label', { for: 'g-venue' }, ['Venue']), venue]),
    ]),
    submit,
  ]);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!opponent.value.trim() || !date.value) {
      notify('Opponent and date are required.', 'error');
      return;
    }
    void (async () => {
      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      try {
        await getRepository().createGame({
          opponent: opponent.value,
          matchDate: date.value,
          matchTime: time.value,
          venue: venue.value,
        });
        notify('Game created.');
        onCreated();
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        submit.removeAttribute('aria-busy');
        submit.disabled = false;
      }
    })();
  });

  return form;
}

function gameCard(game: Game): HTMLElement {
  return el('a', { class: 'card game-card', href: `/admin/games/${game.id}`, 'data-link': 'true' }, [
    el('div', { class: 'card__body section-gap' }, [
      el('span', { class: 'gc-opp' }, [game.opponent]),
      el('span', { class: 'gc-meta' }, [formatMatchDateTime(game.matchDate, game.matchTime) || 'Date TBD']),
      el('span', { class: 'gc-meta' }, [game.venue || 'Venue TBD']),
      el('div', { class: 'gc-foot' }, [statusBanner(game.isOpen), el('span', { class: 'gc-meta' }, ['Manage →'])]),
    ]),
  ]);
}

function gamesView(session: AdminSession, games: Game[]): HTMLElement {
  const grid = el('div', { class: 'game-grid' });
  if (games.length === 0) {
    grid.append(el('div', { class: 'empty-state' }, ['No games yet. Create your first match above.']));
  } else {
    for (const g of games) grid.append(gameCard(g));
  }

  const actions = el('div', { class: 'topbar-actions' }, [
    el('span', { class: 'who' }, [session.email]),
    signOutButton(),
  ]);

  return el('div', {}, [
    topbar(actions),
    el('main', { class: 'page', id: 'main' }, [
      el('p', { class: 'eyebrow' }, ['Fixtures']),
      el('h1', { class: 'card__title', style: 'font-size:1.8rem;margin-bottom:20px;' }, ['Your games']),
      el('div', { class: 'card', style: 'margin-bottom:28px;' }, [
        el('div', { class: 'card__body' }, [
          el('h2', { class: 'card__title' }, ['New game']),
          createGameForm(() => void adminHome()),
        ]),
      ]),
      grid,
    ]),
  ]);
}

export async function adminHome(): Promise<void> {
  const repo = getRepository();
  const session = await repo.getSession();
  if (!session) {
    render(loginView());
    return;
  }
  try {
    const games = await repo.listGames();
    render(gamesView(session, games));
  } catch (err) {
    notify(errorMessage(err), 'error');
    render(loginView());
  }
}
