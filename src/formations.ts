export interface Formation {
  positions: string[];
  coords: [number, number][];
}

export const FIELD_WIDTH = 560;
export const FIELD_HEIGHT = 780;

export const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
    coords: [[280, 720], [100, 580], [200, 600], [360, 600], [460, 580], [100, 400], [210, 420], [350, 420], [460, 400], [200, 200], [360, 200]],
  },
  '4-3-3': {
    positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
    coords: [[280, 720], [100, 580], [200, 600], [360, 600], [460, 580], [180, 400], [280, 380], [380, 400], [120, 200], [280, 160], [440, 200]],
  },
  '3-5-2': {
    positions: ['GK', 'CB', 'CB', 'CB', 'LM', 'CDM', 'CM', 'CDM', 'RM', 'ST', 'ST'],
    coords: [[280, 720], [160, 600], [280, 620], [400, 600], [80, 380], [200, 420], [280, 360], [360, 420], [480, 380], [210, 180], [350, 180]],
  },
  '4-2-3-1': {
    positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LW', 'CAM', 'RW', 'ST'],
    coords: [[280, 720], [100, 580], [210, 610], [350, 610], [460, 580], [210, 440], [350, 440], [120, 280], [280, 260], [440, 280], [280, 140]],
  },
  '4-5-1': {
    positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST'],
    coords: [[280, 720], [100, 580], [200, 610], [360, 610], [460, 580], [100, 380], [200, 400], [280, 380], [360, 400], [460, 380], [280, 160]],
  },
  '3-4-3': {
    positions: ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW'],
    coords: [[280, 720], [160, 600], [280, 620], [400, 600], [100, 390], [220, 400], [340, 400], [460, 390], [140, 180], [280, 150], [420, 180]],
  },
  '4-1-4-1': {
    positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
    coords: [[280, 720], [100, 580], [210, 610], [350, 610], [460, 580], [280, 470], [100, 340], [220, 340], [340, 340], [460, 340], [280, 140]],
  },
  '4-4-1-1': {
    positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'CAM', 'ST'],
    coords: [[280, 720], [100, 580], [210, 610], [350, 610], [460, 580], [100, 400], [220, 420], [340, 420], [460, 400], [280, 250], [280, 130]],
  },
};

export const FORMATION_NAMES: string[] = Object.keys(FORMATIONS);

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

export const POSITION_GROUPS: Record<string, PositionGroup> = {
  GK: 'GK',
  CB: 'DEF', LCB: 'DEF', RCB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', CF: 'FWD', ST: 'FWD',
};

export const ALL_POSITIONS: string[] = [
  'GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'LW', 'RW', 'CF', 'ST',
];

export const DEFAULT_POSITION = 'CM';

const POSITION_COMPATIBILITY: Record<string, string[]> = {
  GK: ['GK'],
  CB: ['CB'], LCB: ['CB'], RCB: ['CB'],
  LB: ['LB', 'LWB'], RB: ['RB', 'RWB'], LWB: ['LB', 'LWB'], RWB: ['RB', 'RWB'],
  CDM: ['CDM', 'CM'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM'],
  LM: ['LM'], RM: ['RM'], LW: ['LW'], RW: ['RW'],
  CF: ['CF', 'ST'], ST: ['ST', 'CF'],
};

export function positionGroup(pos: string): PositionGroup {
  return POSITION_GROUPS[pos] ?? 'MID';
}

export interface StarterLike {
  id: string;
  pos: string;
}

export function assignSlots(
  formationName: string,
  starters: StarterLike[],
  slotOverrides: Record<string, number>,
): number[] {
  const formation = FORMATIONS[formationName] ?? FORMATIONS['4-4-2'];
  const slotCount = formation.positions.length;
  const slots: (number | null)[] = new Array(slotCount).fill(null);
  const assigned = new Set<number>();

  starters.forEach((player, playerIdx) => {
    const override = slotOverrides[player.id];
    if (override !== undefined && override >= 0 && override < slotCount && slots[override] === null) {
      slots[override] = playerIdx;
      assigned.add(playerIdx);
    }
  });

  starters.forEach((player, playerIdx) => {
    if (assigned.has(playerIdx)) return;
    const compatible = POSITION_COMPATIBILITY[player.pos] ?? [player.pos];
    for (let i = 0; i < slotCount; i++) {
      if (slots[i] !== null) continue;
      if (compatible.includes(formation.positions[i])) {
        slots[i] = playerIdx;
        assigned.add(playerIdx);
        return;
      }
    }
  });

  starters.forEach((player, playerIdx) => {
    if (assigned.has(playerIdx)) return;
    const group = positionGroup(player.pos);
    for (let i = 0; i < slotCount; i++) {
      if (slots[i] !== null) continue;
      if (positionGroup(formation.positions[i]) === group) {
        slots[i] = playerIdx;
        assigned.add(playerIdx);
        return;
      }
    }
  });

  starters.forEach((player, playerIdx) => {
    if (assigned.has(playerIdx)) return;
    const avoidGk = positionGroup(player.pos) !== 'GK';
    let fallbackSlot = -1;
    for (let i = 0; i < slotCount; i++) {
      if (slots[i] !== null) continue;
      if (avoidGk && positionGroup(formation.positions[i]) === 'GK') {
        if (fallbackSlot === -1) fallbackSlot = i;
        continue;
      }
      slots[i] = playerIdx;
      assigned.add(playerIdx);
      return;
    }
    if (fallbackSlot !== -1) {
      slots[fallbackSlot] = playerIdx;
      assigned.add(playerIdx);
    }
  });

  const result: number[] = new Array(starters.length);
  slots.forEach((playerIdx, slotIdx) => {
    if (playerIdx !== null) result[playerIdx] = slotIdx;
  });
  return result;
}
