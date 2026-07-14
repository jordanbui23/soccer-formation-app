import type { Game, PublicRsvp, RsvpStatus } from '../types';
import { STATUS_LABEL } from '../types';
import { normalizeHexColor } from '../color';
import { el, formatMatchDateTime } from '../dom';

export function appRoot(): HTMLElement {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app root');
  return root;
}

export function render(...nodes: (Node | string)[]): void {
  const root = appRoot();
  root.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

export function topbar(rightSlot?: Node | null): HTMLElement {
  const brand = el('a', { class: 'brand', href: '/admin', 'data-link': 'true' }, ['Match-day Board']);
  return el('header', { class: 'topbar' }, [
    brand,
    el('div', { class: 'topbar-actions' }, rightSlot ? [rightSlot] : []),
  ]);
}

export function statusPill(status: RsvpStatus): HTMLElement {
  return el('span', { class: `pill pill--${status}` }, [STATUS_LABEL[status]]);
}

export function statusBanner(isOpen: boolean): HTMLElement {
  return el('span', { class: `status-banner ${isOpen ? 'is-open' : 'is-closed'}` }, [
    isOpen ? 'RSVPs open' : 'RSVPs closed',
  ]);
}

export function matchTicket(game: Game, extra?: Node | null): HTMLElement {
  const teamColor = normalizeHexColor(game.teamColor);
  return el('section', { class: 'ticket', style: `--team-color:${teamColor};` }, [
    el('span', { class: 'ticket-accent', 'aria-hidden': 'true' }),
    el('p', { class: 'eyebrow ticket-eyebrow' }, ['Match Day']),
    el('h1', { class: 'ticket-matchup' }, [
      'Our XI',
      el('span', { class: 'vs' }, ['vs']),
      game.opponent || 'TBD',
    ]),
    el('div', { class: 'ticket-meta' }, [
      metaItem('Kickoff', formatMatchDateTime(game.matchDate, game.matchTime) || 'TBD'),
      metaItem('Venue', game.venue || 'TBD'),
      kitItem(teamColor),
    ]),
    extra ?? statusBanner(game.isOpen),
    el('span', { class: 'ticket-perforation', 'aria-hidden': 'true' }),
  ]);
}

function kitItem(teamColor: string): HTMLElement {
  return el('div', {}, [
    el('span', { class: 'meta-label' }, ['Kit']),
    el('span', { class: 'ticket-kit' }, [
      el('span', { class: 'kit-swatch', style: `background:${teamColor};`, 'aria-hidden': 'true' }),
      el('span', { class: 'meta-value' }, ['Home']),
    ]),
  ]);
}

function metaItem(label: string, value: string): HTMLElement {
  return el('div', {}, [
    el('span', { class: 'meta-label' }, [label]),
    el('span', { class: 'meta-value' }, [value]),
  ]);
}

export function loadingView(message = 'Loading…'): HTMLElement {
  return el('div', { class: 'page page--narrow' }, [
    el('div', { class: 'empty-state', role: 'status', 'aria-live': 'polite' }, [message]),
  ]);
}

export function errorView(message: string): HTMLElement {
  return el('div', { class: 'page page--narrow' }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'card__body' }, [
        el('h1', { class: 'card__title' }, ['Not found']),
        el('p', {}, [message]),
        el('a', { class: 'btn-ghost', style: 'margin-top:12px;display:inline-flex;', href: '/admin', 'data-link': 'true' }, [
          'Go to admin',
        ]),
      ]),
    ]),
  ]);
}

export function countByStatus(rsvps: PublicRsvp[]): Record<RsvpStatus, number> {
  const counts: Record<RsvpStatus, number> = { yes: 0, maybe: 0, no: 0 };
  for (const r of rsvps) counts[r.status] += 1;
  return counts;
}
