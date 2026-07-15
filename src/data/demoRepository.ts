import type {
  AdminSession,
  CreatedRsvp,
  EditableRsvp,
  Game,
  GameInput,
  LineupState,
  PublicRsvp,
  Rsvp,
  RsvpInput,
  RsvpStatus,
} from '../types';
import { RSVP_STATUSES } from '../types';
import { generateEditToken, hashToken, newId, timingSafeEqual } from '../crypto';
import { isValidName, normalizeName } from '../lineup';
import { isValidHexColor, normalizeHexColor } from '../color';
import { ALL_POSITIONS } from '../formations';
import { splitFullName } from '../rsvpName';
import { Repository, RepositoryError } from './repository';
import { slugify } from './config';

const STORE_KEY = 'matchday.demo.v1';
const SESSION_KEY = 'matchday.demo.session';

export const DEMO_ADMIN = {
  email: 'coach@matchday.local',
  password: 'matchday-demo',
  userId: 'demo-admin',
};

interface StoredRsvp extends Rsvp {
  editTokenHash: string;
}

interface StoreShape {
  seeded: boolean;
  games: Game[];
  rsvps: StoredRsvp[];
  lineups: Record<string, LineupState>;
}

function emptyStore(): StoreShape {
  return { seeded: false, games: [], rsvps: [], lineups: {} };
}

function normalizeGame(game: Game): Game {
  return { ...game, teamColor: normalizeHexColor(game.teamColor) };
}

function normalizeStoredRsvp(rsvp: StoredRsvp): StoredRsvp {
  return {
    ...rsvp,
    firstName: rsvp.firstName ?? null,
    lastName: rsvp.lastName ?? null,
    preferredPosition: rsvp.preferredPosition ?? null,
  };
}

function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as StoreShape;
    return {
      seeded: Boolean(parsed.seeded),
      games: Array.isArray(parsed.games) ? parsed.games.map(normalizeGame) : [],
      rsvps: Array.isArray(parsed.rsvps) ? parsed.rsvps.map(normalizeStoredRsvp) : [],
      lineups: parsed.lineups ?? {},
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: StoreShape): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function validateStatus(status: RsvpStatus): void {
  if (!RSVP_STATUSES.includes(status)) {
    throw new RepositoryError('invalid_status', 'That availability option is not allowed.');
  }
}

function validateName(name: string): string {
  const clean = normalizeName(name);
  if (!isValidName(clean)) {
    throw new RepositoryError('invalid_name', 'Please enter a name between 1 and 40 characters.');
  }
  return clean;
}

function validateColor(teamColor: string): string {
  if (!isValidHexColor(teamColor)) {
    throw new RepositoryError('invalid_color', 'Choose a valid team color.');
  }
  return normalizeHexColor(teamColor);
}

interface CleanRsvpInput {
  name: string;
  firstName: string;
  lastName: string | null;
  preferredPosition: string;
  status: RsvpStatus;
}

function validateRsvpInput(input: RsvpInput): CleanRsvpInput {
  validateStatus(input.status);
  const firstName = normalizeName(input.firstName);
  if (!isValidName(firstName)) {
    throw new RepositoryError('invalid_name', 'Please enter a first name between 1 and 40 characters.');
  }
  const lastRaw = normalizeName(input.lastName ?? '');
  if (lastRaw.length > 40) {
    throw new RepositoryError('invalid_name', 'Last name must be 40 characters or fewer.');
  }
  if (!ALL_POSITIONS.includes(input.preferredPosition)) {
    throw new RepositoryError('invalid_position', 'Choose a valid position.');
  }
  const composed = lastRaw ? `${firstName} ${lastRaw}` : firstName;
  return {
    name: composed.slice(0, 40),
    firstName,
    lastName: lastRaw || null,
    preferredPosition: input.preferredPosition,
    status: input.status,
  };
}

function publicView(rsvp: StoredRsvp): PublicRsvp {
  return {
    id: rsvp.id,
    name: rsvp.name,
    firstName: rsvp.firstName,
    lastName: rsvp.lastName,
    preferredPosition: rsvp.preferredPosition,
    status: rsvp.status,
  };
}

function adminView(rsvp: StoredRsvp): Rsvp {
  const { editTokenHash: _hash, ...rest } = rsvp;
  return rest;
}

export class DemoRepository implements Repository {
  readonly mode = 'demo' as const;
  readonly demoCredentials = { email: DEMO_ADMIN.email, password: DEMO_ADMIN.password };

  private async ensureSeeded(): Promise<void> {
    const store = loadStore();
    if (store.seeded) return;

    const now = new Date();
    const inThreeDays = new Date(now.getTime() + 3 * 86400000);
    const matchDate = inThreeDays.toISOString().slice(0, 10);
    const game: Game = {
      id: newId(),
      slug: slugify('Riverside Rovers', matchDate),
      opponent: 'Riverside Rovers',
      matchDate,
      matchTime: '19:30',
      venue: 'Central Park Pitch 3',
      teamColor: '#000000',
      isOpen: true,
      createdAt: now.toISOString(),
    };

    const seedPlayers: Array<[string, string, string, RsvpStatus]> = [
      ['Alex', 'Morgan', 'ST', 'yes'],
      ['Sam', 'Kerr', 'ST', 'yes'],
      ['Jordan', 'Pike', 'CB', 'yes'],
      ['Riley', 'Chen', 'CM', 'yes'],
      ['Casey', 'Njoku', 'GK', 'maybe'],
      ['Devin', 'Park', 'LB', 'no'],
      ['Morgan', 'Ellis', 'RW', 'yes'],
    ];

    const rsvps: StoredRsvp[] = [];
    for (const [firstName, lastName, preferredPosition, status] of seedPlayers) {
      const token = generateEditToken();
      rsvps.push({
        id: newId(),
        gameId: game.id,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        preferredPosition,
        status,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        editTokenHash: await hashToken(token),
      });
    }

    saveStore({ seeded: true, games: [game], rsvps, lineups: {} });
  }

  async signIn(email: string, password: string): Promise<AdminSession> {
    await this.ensureSeeded();
    const emailOk = normalizeName(email).toLowerCase() === DEMO_ADMIN.email;
    const passOk = password === DEMO_ADMIN.password;
    if (!emailOk || !passOk) {
      throw new RepositoryError('invalid_credentials', 'Incorrect email or password.');
    }
    const session: AdminSession = { userId: DEMO_ADMIN.userId, email: DEMO_ADMIN.email };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async signOut(): Promise<void> {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async getSession(): Promise<AdminSession | null> {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminSession;
    } catch {
      return null;
    }
  }

  private requireSession(): void {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      throw new RepositoryError('not_authenticated', 'Please sign in to continue.');
    }
  }

  async listGames(): Promise<Game[]> {
    this.requireSession();
    await this.ensureSeeded();
    const store = loadStore();
    return [...store.games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createGame(input: GameInput): Promise<Game> {
    this.requireSession();
    await this.ensureSeeded();
    const opponent = validateName(input.opponent);
    if (!input.matchDate) throw new RepositoryError('invalid_date', 'Match date is required.');
    const store = loadStore();
    const game: Game = {
      id: newId(),
      slug: slugify(opponent, input.matchDate),
      opponent,
      matchDate: input.matchDate,
      matchTime: input.matchTime,
      venue: normalizeName(input.venue),
      teamColor: validateColor(input.teamColor),
      isOpen: true,
      createdAt: new Date().toISOString(),
    };
    store.games.push(game);
    saveStore(store);
    return game;
  }

  async updateGame(id: string, input: GameInput): Promise<Game> {
    this.requireSession();
    await this.ensureSeeded();
    const opponent = validateName(input.opponent);
    if (!input.matchDate) throw new RepositoryError('invalid_date', 'Match date is required.');
    const teamColor = validateColor(input.teamColor);
    const store = loadStore();
    const game = store.games.find((g) => g.id === id);
    if (!game) throw new RepositoryError('not_found', 'Game not found.');
    game.opponent = opponent;
    game.matchDate = input.matchDate;
    game.matchTime = input.matchTime;
    game.venue = normalizeName(input.venue);
    game.teamColor = teamColor;
    saveStore(store);
    return game;
  }

  async getGameById(id: string): Promise<Game | null> {
    this.requireSession();
    await this.ensureSeeded();
    return loadStore().games.find((g) => g.id === id) ?? null;
  }

  async setGameOpen(id: string, isOpen: boolean): Promise<Game> {
    this.requireSession();
    const store = loadStore();
    const game = store.games.find((g) => g.id === id);
    if (!game) throw new RepositoryError('not_found', 'Game not found.');
    game.isOpen = isOpen;
    saveStore(store);
    return game;
  }

  async getGameBySlug(slug: string): Promise<Game | null> {
    await this.ensureSeeded();
    return loadStore().games.find((g) => g.slug === slug) ?? null;
  }

  async listPublicRsvps(gameId: string): Promise<PublicRsvp[]> {
    await this.ensureSeeded();
    return loadStore()
      .rsvps.filter((r) => r.gameId === gameId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(publicView);
  }

  async createRsvp(gameId: string, input: RsvpInput): Promise<CreatedRsvp> {
    await this.ensureSeeded();
    const clean = validateRsvpInput(input);
    const store = loadStore();
    const game = store.games.find((g) => g.id === gameId);
    if (!game) throw new RepositoryError('not_found', 'Game not found.');
    if (!game.isOpen) throw new RepositoryError('game_closed', 'RSVPs are closed for this game.');

    const token = generateEditToken();
    const nowIso = new Date().toISOString();
    const rsvp: StoredRsvp = {
      id: newId(),
      gameId,
      name: clean.name,
      firstName: clean.firstName,
      lastName: clean.lastName,
      preferredPosition: clean.preferredPosition,
      status: clean.status,
      createdAt: nowIso,
      updatedAt: nowIso,
      editTokenHash: await hashToken(token),
    };
    store.rsvps.push(rsvp);
    saveStore(store);
    return { rsvpId: rsvp.id, editToken: token };
  }

  private async findByToken(rsvpId: string, token: string): Promise<StoredRsvp | null> {
    const store = loadStore();
    const rsvp = store.rsvps.find((r) => r.id === rsvpId);
    if (!rsvp) return null;
    const hash = await hashToken(token);
    return timingSafeEqual(hash, rsvp.editTokenHash) ? rsvp : null;
  }

  async getRsvpForEdit(rsvpId: string, token: string): Promise<EditableRsvp | null> {
    await this.ensureSeeded();
    const rsvp = await this.findByToken(rsvpId, token);
    if (!rsvp) return null;
    return {
      id: rsvp.id,
      name: rsvp.name,
      firstName: rsvp.firstName,
      lastName: rsvp.lastName,
      preferredPosition: rsvp.preferredPosition,
      status: rsvp.status,
    };
  }

  async updateRsvpByToken(rsvpId: string, token: string, input: RsvpInput): Promise<EditableRsvp> {
    await this.ensureSeeded();
    const clean = validateRsvpInput(input);
    const store = loadStore();
    const rsvp = store.rsvps.find((r) => r.id === rsvpId);
    if (!rsvp) throw new RepositoryError('not_found', 'RSVP not found.');
    const hash = await hashToken(token);
    if (!timingSafeEqual(hash, rsvp.editTokenHash)) {
      throw new RepositoryError('invalid_token', 'This edit link is not valid.');
    }
    const game = store.games.find((g) => g.id === rsvp.gameId);
    if (!game || !game.isOpen) {
      throw new RepositoryError('game_closed', 'RSVPs are closed for this game.');
    }
    rsvp.name = clean.name;
    rsvp.firstName = clean.firstName;
    rsvp.lastName = clean.lastName;
    rsvp.preferredPosition = clean.preferredPosition;
    rsvp.status = clean.status;
    rsvp.updatedAt = new Date().toISOString();
    saveStore(store);
    return {
      id: rsvp.id,
      name: rsvp.name,
      firstName: rsvp.firstName,
      lastName: rsvp.lastName,
      preferredPosition: rsvp.preferredPosition,
      status: rsvp.status,
    };
  }

  async listRsvps(gameId: string): Promise<Rsvp[]> {
    this.requireSession();
    await this.ensureSeeded();
    return loadStore()
      .rsvps.filter((r) => r.gameId === gameId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(adminView);
  }

  async updateRsvpAdmin(rsvpId: string, name: string, status: RsvpStatus): Promise<Rsvp> {
    this.requireSession();
    validateStatus(status);
    const clean = validateName(name);
    const store = loadStore();
    const rsvp = store.rsvps.find((r) => r.id === rsvpId);
    if (!rsvp) throw new RepositoryError('not_found', 'RSVP not found.');
    const parts = splitFullName(clean);
    rsvp.name = clean;
    rsvp.firstName = parts.firstName;
    rsvp.lastName = parts.lastName;
    rsvp.status = status;
    rsvp.updatedAt = new Date().toISOString();
    saveStore(store);
    return adminView(rsvp);
  }

  async deleteRsvpAdmin(rsvpId: string): Promise<void> {
    this.requireSession();
    const store = loadStore();
    store.rsvps = store.rsvps.filter((r) => r.id !== rsvpId);
    saveStore(store);
  }

  async getLineup(gameId: string): Promise<LineupState | null> {
    this.requireSession();
    return loadStore().lineups[gameId] ?? null;
  }

  async saveLineup(gameId: string, state: LineupState): Promise<void> {
    this.requireSession();
    const store = loadStore();
    store.lineups[gameId] = state;
    saveStore(store);
  }
}
