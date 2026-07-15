import { describe, it, expect } from 'vitest';
import { emptyLineup, type LineupState } from '../src/types';
import {
  MAX_STARTERS,
  addManualPlayer,
  changePosition,
  countStarters,
  getStarters,
  getSubs,
  isValidName,
  normalizeName,
  reconcileLineup,
  removePlayer,
  setFormation,
  swapSlots,
  toggleStarter,
  type YesRsvpRef,
} from '../src/lineup';

function base(): LineupState {
  return emptyLineup('4-4-2');
}

describe('name validation', () => {
  it('normalizes whitespace', () => {
    expect(normalizeName('  Alex   Morgan ')).toBe('Alex Morgan');
  });
  it('rejects empty and oversized names', () => {
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('a'.repeat(41))).toBe(false);
    expect(isValidName('Sam')).toBe(true);
  });
});

describe('reconcileLineup', () => {
  it('adds a Yes RSVP once as a bench player', () => {
    const yes: YesRsvpRef[] = [{ id: 'r1', name: 'Alex' }];
    const first = reconcileLineup(base(), yes);
    expect(first.players).toHaveLength(1);
    expect(first.players[0]).toMatchObject({ rsvpId: 'r1', name: 'Alex', starter: false, manual: false });

    const second = reconcileLineup(first, yes);
    expect(second.players).toHaveLength(1);
  });

  it('removes a player when their RSVP is no longer Yes', () => {
    const withPlayer = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    const removed = reconcileLineup(withPlayer, []);
    expect(removed.players).toHaveLength(0);
  });

  it('keeps manually added players when RSVPs change', () => {
    let state = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    state = addManualPlayer(state, 'Coach Pick', 'ST');
    const after = reconcileLineup(state, []);
    expect(after.players).toHaveLength(1);
    expect(after.players[0].manual).toBe(true);
    expect(after.players[0].name).toBe('Coach Pick');
  });

  it('reflects an admin RSVP name edit on the linked player', () => {
    const state = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    const renamed = reconcileLineup(state, [{ id: 'r1', name: 'Alexandra' }]);
    expect(renamed.players[0].name).toBe('Alexandra');
    expect(renamed.players[0].rsvpId).toBe('r1');
  });

  it('cleans up placement data for removed players', () => {
    let state = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    const pid = state.players[0].id;
    state.customPositions[pid] = { x: 100, y: 100 };
    state.slotOverrides[pid] = 3;
    const after = reconcileLineup(state, []);
    expect(after.customPositions[pid]).toBeUndefined();
    expect(after.slotOverrides[pid]).toBeUndefined();
  });

  it('preserves starter flag and position across reconcile', () => {
    let state = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    state = changePosition(state, state.players[0].id, 'ST');
    state = toggleStarter(state, state.players[0].id);
    const after = reconcileLineup(state, [{ id: 'r1', name: 'Alex' }]);
    expect(after.players[0].pos).toBe('ST');
    expect(after.players[0].starter).toBe(true);
  });

  it('adds a new Yes RSVP at its preferred position', () => {
    const state = reconcileLineup(base(), [{ id: 'r1', name: 'Alex', preferredPosition: 'RW' }]);
    expect(state.players[0].pos).toBe('RW');
  });

  it('falls back to the default position for a missing or invalid preferred position', () => {
    const missing = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    expect(missing.players[0].pos).toBe('CM');
    const invalid = reconcileLineup(base(), [{ id: 'r2', name: 'Sam', preferredPosition: 'BOSS' }]);
    expect(invalid.players[0].pos).toBe('CM');
  });

  it('does not overwrite a coach position edit when the preferred position differs on re-sync', () => {
    const yes: YesRsvpRef[] = [{ id: 'r1', name: 'Alex', preferredPosition: 'RW' }];
    let state = reconcileLineup(base(), yes);
    expect(state.players[0].pos).toBe('RW');
    state = changePosition(state, state.players[0].id, 'ST');
    const after = reconcileLineup(state, yes);
    expect(after.players[0].pos).toBe('ST');
  });
});

describe('starter management', () => {
  it('never exceeds the maximum number of starters', () => {
    const refs: YesRsvpRef[] = Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, name: `P${i}` }));
    let state = reconcileLineup(base(), refs);
    for (const p of state.players) state = toggleStarter(state, p.id);
    expect(countStarters(state)).toBe(MAX_STARTERS);
    expect(getStarters(state)).toHaveLength(MAX_STARTERS);
    expect(getSubs(state).length).toBe(13 - MAX_STARTERS);
  });

  it('moves a starter back to the bench and forgets placement', () => {
    let state = reconcileLineup(base(), [{ id: 'r1', name: 'Alex' }]);
    const id = state.players[0].id;
    state = toggleStarter(state, id);
    state.customPositions[id] = { x: 50, y: 50 };
    state = toggleStarter(state, id);
    expect(state.players[0].starter).toBe(false);
    expect(state.customPositions[id]).toBeUndefined();
  });
});

describe('manual players and formation', () => {
  it('adds a manual player as a starter while slots remain', () => {
    const state = addManualPlayer(base(), 'Coach Pick', 'CM');
    expect(state.players[0].starter).toBe(true);
    expect(state.players[0].manual).toBe(true);
  });

  it('rejects invalid manual names without mutating state', () => {
    const start = base();
    const result = addManualPlayer(start, '   ', 'CM');
    expect(result).toBe(start);
  });

  it('removes a player and clears placement', () => {
    let state = addManualPlayer(base(), 'Coach Pick', 'CM');
    const id = state.players[0].id;
    state.slotOverrides[id] = 4;
    state = removePlayer(state, id);
    expect(state.players).toHaveLength(0);
    expect(state.slotOverrides[id]).toBeUndefined();
  });

  it('resets custom placement when the formation changes', () => {
    let state = addManualPlayer(base(), 'Coach Pick', 'CM');
    const id = state.players[0].id;
    state.customPositions[id] = { x: 10, y: 10 };
    state.slotOverrides[id] = 2;
    state = setFormation(state, '4-3-3');
    expect(state.formation).toBe('4-3-3');
    expect(state.customPositions).toEqual({});
    expect(state.slotOverrides).toEqual({});
  });
});

describe('swapSlots', () => {
  it('swaps slot overrides and clears custom positions', () => {
    let state = reconcileLineup(base(), [
      { id: 'r1', name: 'A' },
      { id: 'r2', name: 'B' },
    ]);
    const [a, b] = state.players.map((p) => p.id);
    state.customPositions[a] = { x: 1, y: 1 };
    state = swapSlots(state, a, 1, b, 5);
    expect(state.slotOverrides[a]).toBe(5);
    expect(state.slotOverrides[b]).toBe(1);
    expect(state.customPositions[a]).toBeUndefined();
  });
});

describe('immutability', () => {
  it('does not mutate the input state', () => {
    const start = base();
    const snapshot = JSON.stringify(start);
    addManualPlayer(start, 'X', 'CM');
    reconcileLineup(start, [{ id: 'r1', name: 'Y' }]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
