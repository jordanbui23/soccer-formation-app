import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ADMIN, DemoRepository } from '../src/data/demoRepository';
import type { GameInput } from '../src/types';

const STORE_KEY = 'matchday.demo.v1';

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const baseInput: GameInput = {
  opponent: 'Test United',
  matchDate: '2026-08-15',
  matchTime: '15:00',
  venue: 'Test Stadium',
  teamColor: '#000000',
};

describe('DemoRepository game colors', () => {
  let repo: DemoRepository;
  let local: TestStorage;
  let session: TestStorage;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(async () => {
    local = new TestStorage();
    session = new TestStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
    repo = new DemoRepository();
    await repo.signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: originalSessionStorage, configurable: true });
  });

  it('normalizes and persists a valid color when creating a game', async () => {
    const created = await repo.createGame({ ...baseInput, teamColor: '  #1A7A45  ' });
    const loaded = await repo.getGameById(created.id);

    expect(created.teamColor).toBe('#1a7a45');
    expect(loaded?.teamColor).toBe('#1a7a45');
  });

  it.each(['#fff', '000000', '#gggggg', '#12345'])(
    'rejects invalid create color %s',
    async (teamColor) => {
      await expect(repo.createGame({ ...baseInput, teamColor })).rejects.toMatchObject({
        code: 'invalid_color',
      });
    },
  );

  it('updates fixture details and color without changing stable game fields', async () => {
    const created = await repo.createGame(baseInput);
    await repo.setGameOpen(created.id, false);

    const updated = await repo.updateGame(created.id, {
      opponent: 'Updated Athletic',
      matchDate: '2026-08-16',
      matchTime: '19:30',
      venue: 'New Ground',
      teamColor: '#FFD400',
    });

    expect(updated).toMatchObject({
      id: created.id,
      slug: created.slug,
      createdAt: created.createdAt,
      isOpen: false,
      opponent: 'Updated Athletic',
      matchDate: '2026-08-16',
      matchTime: '19:30',
      venue: 'New Ground',
      teamColor: '#ffd400',
    });
  });

  it('rejects an invalid update without partially mutating the game', async () => {
    const created = await repo.createGame(baseInput);

    await expect(
      repo.updateGame(created.id, {
        ...baseInput,
        opponent: 'Should Not Persist',
        teamColor: '#bad',
      }),
    ).rejects.toMatchObject({ code: 'invalid_color' });

    expect(await repo.getGameById(created.id)).toEqual(created);
  });

  it('defaults a pre-feature stored game to black', async () => {
    local.setItem(
      STORE_KEY,
      JSON.stringify({
        seeded: true,
        games: [
          {
            id: 'legacy-game',
            slug: 'legacy-game',
            opponent: 'Legacy FC',
            matchDate: '2026-08-15',
            matchTime: '15:00',
            venue: 'Old Ground',
            isOpen: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        rsvps: [],
        lineups: {},
      }),
    );

    expect((await repo.getGameById('legacy-game'))?.teamColor).toBe('#000000');
  });
});
