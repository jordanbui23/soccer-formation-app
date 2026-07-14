import { describe, it, expect } from 'vitest';
import {
  FORMATIONS,
  FORMATION_NAMES,
  assignSlots,
  positionGroup,
  type StarterLike,
} from '../src/formations';

describe('formations catalog', () => {
  it('preserves all eight formations', () => {
    expect(FORMATION_NAMES).toEqual([
      '4-4-2',
      '4-3-3',
      '3-5-2',
      '4-2-3-1',
      '4-5-1',
      '3-4-3',
      '4-1-4-1',
      '4-4-1-1',
    ]);
  });

  it('every formation has 11 positions and 11 coordinates', () => {
    for (const name of FORMATION_NAMES) {
      const f = FORMATIONS[name];
      expect(f.positions).toHaveLength(11);
      expect(f.coords).toHaveLength(11);
    }
  });
});

describe('positionGroup', () => {
  it('maps positions to groups', () => {
    expect(positionGroup('GK')).toBe('GK');
    expect(positionGroup('RCB')).toBe('DEF');
    expect(positionGroup('CDM')).toBe('MID');
    expect(positionGroup('ST')).toBe('FWD');
  });

  it('falls back to MID for unknown positions', () => {
    expect(positionGroup('ZZ')).toBe('MID');
  });
});

function starters(list: Array<[string, string]>): StarterLike[] {
  return list.map(([id, pos]) => ({ id, pos }));
}

describe('assignSlots', () => {
  it('places a goalkeeper into the GK slot (index 0)', () => {
    const result = assignSlots('4-4-2', starters([['gk', 'GK']]), {});
    expect(result[0]).toBe(0);
  });

  it('snaps a compatible position (RCB -> a CB slot)', () => {
    const result = assignSlots('4-4-2', starters([['d', 'RCB']]), {});
    const slot = result[0];
    expect(FORMATIONS['4-4-2'].positions[slot]).toBe('CB');
  });

  it('honours an explicit slot override', () => {
    const result = assignSlots('4-4-2', starters([['a', 'ST'], ['b', 'ST']]), { b: 9 });
    expect(result[1]).toBe(9);
  });

  it('fills the next open slot when no compatible slot remains', () => {
    const result = assignSlots('4-3-3', starters([['lm', 'LM']]), {});
    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[0]).toBeLessThan(11);
  });

  it('assigns unique slots to a full XI', () => {
    const eleven = starters(
      FORMATIONS['4-4-2'].positions.map((pos, i) => [`p${i}`, pos] as [string, string]),
    );
    const result = assignSlots('4-4-2', eleven, {});
    expect(new Set(result).size).toBe(11);
  });
});
