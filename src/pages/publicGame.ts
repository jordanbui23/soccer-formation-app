import type { Game, PublicRsvp, RsvpStatus } from '../types';
import { RSVP_STATUSES, STATUS_LABEL } from '../types';
import { getRepository } from '../data';
import { forgetRsvp, getRememberedRsvp, rememberRsvp } from '../rememberedRsvp';
import { el } from '../dom';
import { navigate } from '../router';
import { notify, errorMessage } from '../ui/toast';
import {
  countByStatus,
  errorView,
  loadingView,
  matchTicket,
  render,
  statusPill,
} from '../ui/components';

const STATUS_ORDER: RsvpStatus[] = ['yes', 'maybe', 'no'];

function rosterSection(rsvps: PublicRsvp[]): HTMLElement {
  const groups = el('div', { class: 'rsvp-groups' });
  let total = 0;
  for (const status of STATUS_ORDER) {
    const members = rsvps.filter((r) => r.status === status);
    if (members.length === 0) continue;
    total += members.length;
    const list = el('ul', { class: 'roster' });
    for (const r of members) {
      list.append(
        el('li', { class: `is-${status}` }, [
          el('span', { class: 'r-name' }, [r.name]),
          statusPill(r.status),
        ]),
      );
    }
    groups.append(
      el('div', { class: 'rsvp-group' }, [
        el('h3', {}, [STATUS_LABEL[status], el('span', { class: 'count' }, [String(members.length)])]),
        list,
      ]),
    );
  }
  if (total === 0) {
    groups.append(el('div', { class: 'empty-state' }, ['No responses yet. Be the first to reply.']));
  }
  return groups;
}

function rsvpForm(game: Game, onCreated: (rsvpId: string, token: string, name: string) => void): HTMLElement {
  const nameInput = el('input', {
    type: 'text',
    id: 'rsvp-name',
    required: true,
    maxLength: 40,
    autocomplete: 'name',
    placeholder: 'Your name',
  });

  const choice = el('div', { class: 'rsvp-choice', role: 'radiogroup', 'aria-label': 'Your availability' });
  RSVP_STATUSES.forEach((status, idx) => {
    const id = `status-${status}`;
    const input = el('input', { type: 'radio', name: 'status', id, value: status, checked: idx === 0 });
    choice.append(input, el('label', { for: id }, [STATUS_LABEL[status]]));
  });

  const submit = el('button', { type: 'submit', class: 'btn-accent btn-block' }, ['Send RSVP']);
  const form = el('form', { class: 'section-gap', novalidate: true }, [
    el('div', { class: 'field-group' }, [el('label', { for: 'rsvp-name' }, ['Name']), nameInput]),
    el('div', { class: 'field-group' }, [el('label', {}, ['Availability']), choice]),
    submit,
  ]);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      notify('Please enter your name.', 'error');
      nameInput.focus();
      return;
    }
    const selected = (form.querySelector('input[name="status"]:checked') as HTMLInputElement | null)?.value as
      | RsvpStatus
      | undefined;
    const status = selected ?? 'yes';
    void (async () => {
      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      try {
        const { rsvpId, editToken } = await getRepository().createRsvp(game.id, name, status);
        onCreated(rsvpId, editToken, name);
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

function editRouteFor(game: Game, rsvpId: string, token: string): string {
  return `/game/${encodeURIComponent(game.slug)}/edit/${encodeURIComponent(rsvpId)}#token=${token}`;
}

function editLinkFor(game: Game, rsvpId: string, token: string): string {
  return `${location.origin}${editRouteFor(game, rsvpId, token)}`;
}

function createdCallout(game: Game, rsvpId: string, token: string, name: string): HTMLElement {
  const url = editLinkFor(game, rsvpId, token);
  const linkInput = el('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Your private edit link' });
  const copyBtn = el('button', { type: 'button', class: 'btn-accent' }, ['Copy']);
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(url).then(
      () => notify('Edit link copied.'),
      () => notify('Copy failed. Select the link manually.', 'error'),
    );
  });
  const editNow = el('button', { type: 'button', class: 'btn-ghost btn-block' }, ['Edit my RSVP now']);
  editNow.addEventListener('click', () => navigate(editRouteFor(game, rsvpId, token)));

  return el('div', { class: 'token-callout section-gap' }, [
    el('p', {}, [`Thanks, ${name}! Your reply is saved.`]),
    el('p', { style: 'font-size:0.85rem;opacity:0.85;' }, [
      'Save this private link to edit your name or availability later. It is the only way back to your RSVP, so keep it safe.',
    ]),
    el('div', { class: 'copy-row' }, [linkInput, copyBtn]),
    editNow,
  ]);
}

export async function publicGamePage(slug: string): Promise<void> {
  render(loadingView('Loading the match…'));
  const repo = getRepository();
  let game: Game | null;
  try {
    game = await repo.getGameBySlug(slug);
  } catch (err) {
    render(errorView(errorMessage(err)));
    return;
  }
  if (!game) {
    render(errorView('This game link is not valid or has been removed.'));
    return;
  }

  const rsvps = await repo.listPublicRsvps(game.id).catch(() => [] as PublicRsvp[]);
  const counts = countByStatus(rsvps);
  const currentGame = game;

  const remembered = getRememberedRsvp(currentGame.id);
  if (remembered && !rsvps.some((r) => r.id === remembered.rsvpId)) {
    forgetRsvp(currentGame.id);
  }
  const rememberedEdit = getRememberedRsvp(currentGame.id);

  const rememberedEditButton = (): HTMLElement | null => {
    if (!rememberedEdit) return null;
    const btn = el('button', { type: 'button', class: 'btn-accent btn-block' }, ['Edit your RSVP']);
    btn.addEventListener('click', () =>
      navigate(editRouteFor(currentGame, rememberedEdit.rsvpId, rememberedEdit.token)),
    );
    return el('div', { class: 'section-gap' }, [
      btn,
      el('p', { style: 'font-size:0.85rem;opacity:0.85;margin-top:8px;' }, [
        'We remembered your reply on this device. You can still use your private link on other devices.',
      ]),
    ]);
  };

  const rsvpPanel = el('div', { class: 'card__body section-gap' });
  const rebuildRsvpPanel = () => {
    if (!currentGame.isOpen) {
      rsvpPanel.replaceChildren(
        el('h2', { class: 'card__title' }, ['RSVPs are closed']),
        el('div', { class: 'msg msg--info' }, [
          'The lineup for this match is locked. Contact your organizer if you need a change.',
        ]),
      );
      return;
    }
    const editBlock = rememberedEditButton();
    rsvpPanel.replaceChildren(
      el('h2', { class: 'card__title' }, ["Can you make it?"]),
      ...(editBlock ? [editBlock] : []),
      rsvpForm(currentGame, (rsvpId, token, name) => {
        rememberRsvp(currentGame.id, rsvpId, token);
        rsvpPanel.replaceChildren(
          el('h2', { class: 'card__title' }, ['You are in']),
          createdCallout(currentGame, rsvpId, token, name),
        );
      }),
    );
  };
  rebuildRsvpPanel();

  render(
    el('main', { class: 'page', id: 'main' }, [
      matchTicket(currentGame),
      el('div', { class: 'detail-grid', style: 'margin-top:24px;' }, [
        el('div', { class: 'card' }, [rsvpPanel]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card__body section-gap' }, [
            el('h2', { class: 'card__title' }, ['Who is in']),
            el('p', { class: 'starter-count' }, [
              `${counts.yes} in · ${counts.maybe} maybe · ${counts.no} out`,
            ]),
            rosterSection(rsvps),
          ]),
        ]),
      ]),
    ]),
  );
}
