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

export class RepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export interface Repository {
  readonly mode: 'demo' | 'supabase';
  readonly demoCredentials: { email: string; password: string } | null;

  signIn(email: string, password: string): Promise<AdminSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AdminSession | null>;

  listGames(): Promise<Game[]>;
  createGame(input: GameInput): Promise<Game>;
  updateGame(id: string, input: GameInput): Promise<Game>;
  getGameById(id: string): Promise<Game | null>;
  setGameOpen(id: string, isOpen: boolean): Promise<Game>;

  getGameBySlug(slug: string): Promise<Game | null>;

  listPublicRsvps(gameId: string): Promise<PublicRsvp[]>;
  createRsvp(gameId: string, input: RsvpInput): Promise<CreatedRsvp>;
  getRsvpForEdit(rsvpId: string, token: string): Promise<EditableRsvp | null>;
  updateRsvpByToken(rsvpId: string, token: string, input: RsvpInput): Promise<EditableRsvp>;

  listRsvps(gameId: string): Promise<Rsvp[]>;
  updateRsvpAdmin(rsvpId: string, name: string, status: RsvpStatus): Promise<Rsvp>;
  deleteRsvpAdmin(rsvpId: string): Promise<void>;

  getLineup(gameId: string): Promise<LineupState | null>;
  saveLineup(gameId: string, state: LineupState): Promise<void>;
}
