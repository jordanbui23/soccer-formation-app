import type {
  AdminSession,
  CreatedRsvp,
  EditableRsvp,
  Game,
  GameInput,
  LineupState,
  PublicRsvp,
  Rsvp,
  RsvpStatus,
} from '../types';
import { RSVP_STATUSES } from '../types';
import { generateEditToken, hashToken, newId, timingSafeEqual } from '../crypto';
import { isValidName, normalizeName } from '../lineup';
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

function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as StoreShape;
    return {
      seeded: Boolean(parsed.seeded),
      games: Array.isArray(parsed.games) ? parsed.games : [],
      rsvps: Array.isArray(parsed.rsvps) ? parsed.rsvps : [],
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

function publicView(rsvp: StoredRsvp): PublicRsvp {
  return { id: rsvp.id, name: rsvp.name, status: rsvp.status };
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
      isOpen: true,
      createdAt: now.toISOString(),
    };

    const seedNames: Array<[string, RsvpStatus]> = [
      ['Alex Morgan', 'yes'],
      ['Sam Kerr', 'yes'],
      ['Jordan Pike', 'yes'],
      ['Riley Chen', 'yes'],
      ['Casey Njoku', 'maybe'],
      ['Devin Park', 'no'],
      ['Morgan Ellis', 'yes'],
    ];

    const rsvps: StoredRsvp[] = [];
    for (const [name, status] of seedNames) {
      const token = generateEditToken();
      rsvps.push({
        id: newId(),
        gameId: game.id,
        name,
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
      isOpen: true,
      createdAt: new Date().toISOString(),
    };
    store.games.push(game);
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

  async createRsvp(gameId: string, name: string, status: RsvpStatus): Promise<CreatedRsvp> {
    await this.ensureSeeded();
    validateStatus(status);
    const clean = validateName(name);
    const store = loadStore();
    const game = store.games.find((g) => g.id === gameId);
    if (!game) throw new RepositoryError('not_found', 'Game not found.');
    if (!game.isOpen) throw new RepositoryError('game_closed', 'RSVPs are closed for this game.');

    const token = generateEditToken();
    const nowIso = new Date().toISOString();
    const rsvp: StoredRsvp = {
      id: newId(),
      gameId,
      name: clean,
      status,
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
    return { id: rsvp.id, name: rsvp.name, status: rsvp.status };
  }

  async updateRsvpByToken(
    rsvpId: string,
    token: string,
    name: string,
    status: RsvpStatus,
  ): Promise<EditableRsvp> {
    await this.ensureSeeded();
    validateStatus(status);
    const clean = validateName(name);
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
    rsvp.name = clean;
    rsvp.status = status;
    rsvp.updatedAt = new Date().toISOString();
    saveStore(store);
    return { id: rsvp.id, name: rsvp.name, status: rsvp.status };
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
    rsvp.name = clean;
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
