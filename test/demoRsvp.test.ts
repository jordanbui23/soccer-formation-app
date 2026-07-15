import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ADMIN, DemoRepository } from '../src/data/demoRepository';
import type { RsvpInput } from '../src/types';

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

const baseRsvp: RsvpInput = {
  firstName: 'Alex',
  lastName: 'Morgan',
  preferredPosition: 'ST',
  status: 'yes',
};

describe('DemoRepository structured RSVP names + position', () => {
  let repo: DemoRepository;
  let local: TestStorage;
  let session: TestStorage;
  let gameId: string;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(async () => {
    local = new TestStorage();
    session = new TestStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
    repo = new DemoRepository();
    await repo.signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const games = await repo.listGames();
    gameId = games[0].id;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: originalSessionStorage, configurable: true });
  });

  it('composes name, stores structured fields, and persists them', async () => {
    const created = await repo.createRsvp(gameId, baseRsvp);
    const editable = await repo.getRsvpForEdit(created.rsvpId, created.editToken);

    expect(editable).toMatchObject({
      name: 'Alex Morgan',
      firstName: 'Alex',
      lastName: 'Morgan',
      preferredPosition: 'ST',
      status: 'yes',
    });
  });

  it('treats last name as optional and stores null', async () => {
    const created = await repo.createRsvp(gameId, { ...baseRsvp, lastName: '' });
    const editable = await repo.getRsvpForEdit(created.rsvpId, created.editToken);

    expect(editable).toMatchObject({ name: 'Alex', firstName: 'Alex', lastName: null });
  });

  it('requires a first name', async () => {
    await expect(repo.createRsvp(gameId, { ...baseRsvp, firstName: '   ' })).rejects.toMatchObject({
      code: 'invalid_name',
    });
  });

  it.each(['', 'GKK', 'midfielder', 'cm'])(
    'rejects invalid preferred position %s',
    async (preferredPosition) => {
      await expect(repo.createRsvp(gameId, { ...baseRsvp, preferredPosition })).rejects.toMatchObject({
        code: 'invalid_position',
      });
    },
  );

  it('updates structured fields through the token path', async () => {
    const created = await repo.createRsvp(gameId, baseRsvp);
    const updated = await repo.updateRsvpByToken(created.rsvpId, created.editToken, {
      firstName: 'Sam',
      lastName: 'Kerr',
      preferredPosition: 'CM',
      status: 'maybe',
    });

    expect(updated).toMatchObject({
      name: 'Sam Kerr',
      firstName: 'Sam',
      lastName: 'Kerr',
      preferredPosition: 'CM',
      status: 'maybe',
    });
  });

  it('rejects an invalid position update without mutating the row', async () => {
    const created = await repo.createRsvp(gameId, baseRsvp);
    const before = await repo.getRsvpForEdit(created.rsvpId, created.editToken);

    await expect(
      repo.updateRsvpByToken(created.rsvpId, created.editToken, { ...baseRsvp, preferredPosition: 'BAD' }),
    ).rejects.toMatchObject({ code: 'invalid_position' });

    expect(await repo.getRsvpForEdit(created.rsvpId, created.editToken)).toEqual(before);
  });

  it('re-derives structured fields when an admin edits the single name', async () => {
    const created = await repo.createRsvp(gameId, baseRsvp);
    await repo.updateRsvpAdmin(created.rsvpId, 'Sammy Kerrigan', 'yes');

    const [row] = (await repo.listRsvps(gameId)).filter((r) => r.id === created.rsvpId);
    expect(row).toMatchObject({ name: 'Sammy Kerrigan', firstName: 'Sammy', lastName: 'Kerrigan' });

    const [pub] = (await repo.listPublicRsvps(gameId)).filter((r) => r.id === created.rsvpId);
    expect(pub).toMatchObject({ name: 'Sammy Kerrigan', firstName: 'Sammy', lastName: 'Kerrigan' });
  });

  it('re-derives a null last name when an admin edits to a single-token name', async () => {
    const created = await repo.createRsvp(gameId, baseRsvp);
    await repo.updateRsvpAdmin(created.rsvpId, 'Pele', 'yes');

    const [row] = (await repo.listRsvps(gameId)).filter((r) => r.id === created.rsvpId);
    expect(row).toMatchObject({ name: 'Pele', firstName: 'Pele', lastName: null });
  });

  it('surfaces a pre-feature stored RSVP with null structured fields and name fallback', async () => {
    const now = '2026-01-01T00:00:00.000Z';
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
            teamColor: '#000000',
            isOpen: true,
            createdAt: now,
          },
        ],
        rsvps: [
          {
            id: 'legacy-rsvp',
            gameId: 'legacy-game',
            name: 'Old Timer',
            status: 'yes',
            createdAt: now,
            updatedAt: now,
            editTokenHash: 'deadbeef',
          },
        ],
        lineups: {},
      }),
    );

    const [rsvp] = await repo.listRsvps('legacy-game');
    expect(rsvp).toMatchObject({
      name: 'Old Timer',
      firstName: null,
      lastName: null,
      preferredPosition: null,
    });
    const [publicRsvp] = await repo.listPublicRsvps('legacy-game');
    expect(publicRsvp).toMatchObject({ name: 'Old Timer', firstName: null, preferredPosition: null });
  });
});
