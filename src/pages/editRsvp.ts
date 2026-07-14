import type { EditableRsvp, Game, RsvpStatus } from '../types';
import { RSVP_STATUSES, STATUS_LABEL } from '../types';
import { getRepository } from '../data';
import { el } from '../dom';
import { navigate } from '../router';
import { notify, errorMessage } from '../ui/toast';
import { errorView, loadingView, matchTicket, render } from '../ui/components';

export async function editRsvpPage(slug: string, rsvpId: string, token: string): Promise<void> {
  render(loadingView('Opening your RSVP…'));
  const repo = getRepository();

  if (!token) {
    render(errorView('This edit link is missing its private token.'));
    return;
  }

  let game: Game | null;
  let editable: EditableRsvp | null;
  try {
    game = await repo.getGameBySlug(slug);
    editable = game ? await repo.getRsvpForEdit(rsvpId, token) : null;
  } catch (err) {
    render(errorView(errorMessage(err)));
    return;
  }

  if (!game) {
    render(errorView('This game link is not valid or has been removed.'));
    return;
  }
  if (!editable) {
    render(errorView('This edit link is not valid. Ask your organizer or send a fresh RSVP.'));
    return;
  }

  const currentGame = game;
  const current = editable;

  const nameInput = el('input', {
    type: 'text',
    id: 'edit-name',
    value: current.name,
    maxLength: 40,
    required: true,
    autocomplete: 'name',
  });

  const choice = el('div', { class: 'rsvp-choice', role: 'radiogroup', 'aria-label': 'Your availability' });
  RSVP_STATUSES.forEach((status) => {
    const id = `edit-status-${status}`;
    const input = el('input', {
      type: 'radio',
      name: 'edit-status',
      id,
      value: status,
      checked: status === current.status,
    });
    choice.append(input, el('label', { for: id }, [STATUS_LABEL[status]]));
  });

  const save = el('button', { type: 'submit', class: 'btn-accent btn-block' }, ['Save changes']);
  const backLink = el('a', {
    class: 'btn-ghost btn-block',
    href: `/game/${encodeURIComponent(currentGame.slug)}`,
    'data-link': 'true',
    style: 'margin-top:8px;',
  }, ['Back to the match']);

  const form = el('form', { class: 'section-gap', novalidate: true }, [
    el('div', { class: 'field-group' }, [el('label', { for: 'edit-name' }, ['Name']), nameInput]),
    el('div', { class: 'field-group' }, [el('label', {}, ['Availability']), choice]),
    save,
    backLink,
  ]);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      notify('Please enter your name.', 'error');
      return;
    }
    const selected = (form.querySelector('input[name="edit-status"]:checked') as HTMLInputElement | null)
      ?.value as RsvpStatus | undefined;
    void (async () => {
      save.setAttribute('aria-busy', 'true');
      save.disabled = true;
      try {
        await repo.updateRsvpByToken(rsvpId, token, name, selected ?? current.status);
        notify('Your RSVP was updated.');
        navigate(`/game/${encodeURIComponent(currentGame.slug)}`);
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        save.removeAttribute('aria-busy');
        save.disabled = false;
      }
    })();
  });

  const body = currentGame.isOpen
    ? form
    : el('div', { class: 'msg msg--info' }, ['RSVPs are closed for this match, so it can no longer be edited.']);

  render(
    el('main', { class: 'page page--narrow', id: 'main' }, [
      matchTicket(currentGame),
      el('div', { class: 'card', style: 'margin-top:24px;' }, [
        el('div', { class: 'card__body section-gap' }, [
          el('h2', { class: 'card__title' }, ['Edit your RSVP']),
          body,
        ]),
      ]),
    ]),
  );
}
