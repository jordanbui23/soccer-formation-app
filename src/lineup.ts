import type { Coord, LineupPlayer, LineupState } from './types';
import { DEFAULT_POSITION } from './formations';

export const MAX_STARTERS = 11;
export const MAX_NAME_LENGTH = 40;
export const MIN_NAME_LENGTH = 1;

export interface YesRsvpRef {
  id: string;
  name: string;
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function isValidName(raw: string): boolean {
  const name = normalizeName(raw);
  return name.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH;
}

export function getStarters(state: LineupState): LineupPlayer[] {
  return state.players.filter((p) => p.starter);
}

export function getSubs(state: LineupState): LineupPlayer[] {
  return state.players.filter((p) => !p.starter);
}

export function countStarters(state: LineupState): number {
  return state.players.reduce((n, p) => (p.starter ? n + 1 : n), 0);
}

function cloneState(state: LineupState): LineupState {
  return {
    formation: state.formation,
    players: state.players.map((p) => ({ ...p })),
    customPositions: { ...state.customPositions },
    slotOverrides: { ...state.slotOverrides },
  };
}

function forgetPlayerPlacement(state: LineupState, playerId: string): void {
  delete state.customPositions[playerId];
  delete state.slotOverrides[playerId];
}

export function manualPlayerId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual-${uuid}`;
}

export function reconcileLineup(state: LineupState, yesRsvps: YesRsvpRef[]): LineupState {
  const next = cloneState(state);
  const yesById = new Map(yesRsvps.map((r) => [r.id, r]));
  const presentRsvpIds = new Set(
    next.players.filter((p) => p.rsvpId !== null).map((p) => p.rsvpId as string),
  );

  const kept: LineupPlayer[] = [];
  for (const player of next.players) {
    if (player.rsvpId === null) {
      kept.push(player);
      continue;
    }
    const rsvp = yesById.get(player.rsvpId);
    if (!rsvp) {
      forgetPlayerPlacement(next, player.id);
      continue;
    }
    kept.push({ ...player, name: rsvp.name });
  }
  next.players = kept;

  for (const rsvp of yesRsvps) {
    if (presentRsvpIds.has(rsvp.id)) continue;
    next.players.push({
      id: `rsvp-${rsvp.id}`,
      name: rsvp.name,
      pos: DEFAULT_POSITION,
      starter: false,
      manual: false,
      rsvpId: rsvp.id,
    });
  }

  return next;
}

export function setFormation(state: LineupState, formation: string): LineupState {
  const next = cloneState(state);
  next.formation = formation;
  next.customPositions = {};
  next.slotOverrides = {};
  return next;
}

export function addManualPlayer(state: LineupState, name: string, pos: string): LineupState {
  const clean = normalizeName(name);
  if (!isValidName(clean)) return state;
  const next = cloneState(state);
  const starter = countStarters(next) < MAX_STARTERS;
  next.players.push({
    id: manualPlayerId(),
    name: clean,
    pos,
    starter,
    manual: true,
    rsvpId: null,
  });
  return next;
}

export function removePlayer(state: LineupState, playerId: string): LineupState {
  const next = cloneState(state);
  next.players = next.players.filter((p) => p.id !== playerId);
  forgetPlayerPlacement(next, playerId);
  return next;
}

export function changePosition(state: LineupState, playerId: string, pos: string): LineupState {
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return state;
  player.pos = pos;
  forgetPlayerPlacement(next, playerId);
  return next;
}

export function toggleStarter(state: LineupState, playerId: string): LineupState {
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (!player.starter && countStarters(next) >= MAX_STARTERS) return state;
  player.starter = !player.starter;
  if (!player.starter) forgetPlayerPlacement(next, playerId);
  return next;
}

export function setCustomPosition(state: LineupState, playerId: string, coord: Coord): LineupState {
  const next = cloneState(state);
  next.customPositions[playerId] = coord;
  return next;
}

export function swapSlots(
  state: LineupState,
  aId: string,
  aSlot: number,
  bId: string,
  bSlot: number,
): LineupState {
  const next = cloneState(state);
  next.slotOverrides[aId] = bSlot;
  next.slotOverrides[bId] = aSlot;
  delete next.customPositions[aId];
  delete next.customPositions[bId];
  return next;
}
