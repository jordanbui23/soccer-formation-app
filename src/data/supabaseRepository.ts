import type { SupabaseClient } from '@supabase/supabase-js';
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
import { isValidName, normalizeName } from '../lineup';
import { isValidHexColor, normalizeHexColor } from '../color';
import { ALL_POSITIONS } from '../formations';
import { splitFullName } from '../rsvpName';
import { Repository, RepositoryError } from './repository';

interface GameRow {
  id: string;
  slug: string;
  opponent: string;
  match_date: string;
  match_time: string | null;
  venue: string | null;
  team_color: string | null;
  is_open: boolean;
  created_at: string;
}

interface RsvpRow {
  id: string;
  game_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  preferred_position: string | null;
  status: RsvpStatus;
  created_at: string;
  updated_at: string;
}

const GAME_COLUMNS = 'id, slug, opponent, match_date, match_time, venue, team_color, is_open, created_at';
const RSVP_COLUMNS = 'id, game_id, name, first_name, last_name, preferred_position, status, created_at, updated_at';

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    slug: row.slug,
    opponent: row.opponent,
    matchDate: row.match_date,
    matchTime: row.match_time ?? '',
    venue: row.venue ?? '',
    teamColor: normalizeHexColor(row.team_color),
    isOpen: row.is_open,
    createdAt: row.created_at,
  };
}

function toRsvp(row: RsvpRow): Rsvp {
  return {
    id: row.id,
    gameId: row.game_id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredPosition: row.preferred_position,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RpcRsvpRow {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  preferred_position: string | null;
  status: RsvpStatus;
}

function toEditable(row: RpcRsvpRow): EditableRsvp {
  return {
    id: row.id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredPosition: row.preferred_position,
    status: row.status,
  };
}

function validate(name: string, status: RsvpStatus): string {
  const clean = normalizeName(name);
  if (!isValidName(clean)) {
    throw new RepositoryError('invalid_name', 'Please enter a name between 1 and 40 characters.');
  }
  if (!RSVP_STATUSES.includes(status)) {
    throw new RepositoryError('invalid_status', 'That availability option is not allowed.');
  }
  return clean;
}

interface CleanRsvpInput {
  firstName: string;
  lastName: string;
  preferredPosition: string;
  status: RsvpStatus;
}

function validateRsvpInput(input: RsvpInput): CleanRsvpInput {
  const firstName = normalizeName(input.firstName);
  if (!isValidName(firstName)) {
    throw new RepositoryError('invalid_name', 'Please enter a first name between 1 and 40 characters.');
  }
  const lastName = normalizeName(input.lastName ?? '');
  if (lastName.length > 40) {
    throw new RepositoryError('invalid_name', 'Last name must be 40 characters or fewer.');
  }
  if (!RSVP_STATUSES.includes(input.status)) {
    throw new RepositoryError('invalid_status', 'That availability option is not allowed.');
  }
  if (!ALL_POSITIONS.includes(input.preferredPosition)) {
    throw new RepositoryError('invalid_position', 'Choose a valid position.');
  }
  return { firstName, lastName, preferredPosition: input.preferredPosition, status: input.status };
}

function validateColor(teamColor: string): string {
  if (!isValidHexColor(teamColor)) {
    throw new RepositoryError('invalid_color', 'Choose a valid team color.');
  }
  return normalizeHexColor(teamColor);
}

function fail(prefix: string, message: string | undefined): never {
  throw new RepositoryError(prefix, message ?? 'Something went wrong. Please try again.');
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  readonly demoCredentials = null;

  constructor(private readonly client: SupabaseClient) {}

  async signIn(email: string, password: string): Promise<AdminSession> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizeName(email),
      password,
    });
    if (error || !data.user) fail('invalid_credentials', 'Incorrect email or password.');
    return { userId: data.user.id, email: data.user.email ?? email };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async getSession(): Promise<AdminSession | null> {
    const { data } = await this.client.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    return { userId: user.id, email: user.email ?? '' };
  }

  async listGames(): Promise<Game[]> {
    const { data, error } = await this.client
      .from('games')
      .select(GAME_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) fail('list_games_failed', error.message);
    return (data as GameRow[]).map(toGame);
  }

  async createGame(input: GameInput): Promise<Game> {
    const opponent = normalizeName(input.opponent);
    if (!isValidName(opponent)) {
      throw new RepositoryError('invalid_name', 'Opponent name is required (1-40 characters).');
    }
    if (!input.matchDate) throw new RepositoryError('invalid_date', 'Match date is required.');
    const { data, error } = await this.client
      .from('games')
      .insert({
        opponent,
        match_date: input.matchDate,
        match_time: input.matchTime || null,
        venue: normalizeName(input.venue) || null,
        team_color: validateColor(input.teamColor),
      })
      .select(GAME_COLUMNS)
      .single();
    if (error || !data) fail('create_game_failed', error?.message);
    return toGame(data as GameRow);
  }

  async updateGame(id: string, input: GameInput): Promise<Game> {
    const opponent = normalizeName(input.opponent);
    if (!isValidName(opponent)) {
      throw new RepositoryError('invalid_name', 'Opponent name is required (1-40 characters).');
    }
    if (!input.matchDate) throw new RepositoryError('invalid_date', 'Match date is required.');
    const { data, error } = await this.client
      .from('games')
      .update({
        opponent,
        match_date: input.matchDate,
        match_time: input.matchTime || null,
        venue: normalizeName(input.venue) || null,
        team_color: validateColor(input.teamColor),
      })
      .eq('id', id)
      .select(GAME_COLUMNS)
      .single();
    if (error || !data) fail('update_game_failed', error?.message);
    return toGame(data as GameRow);
  }

  async getGameById(id: string): Promise<Game | null> {
    const { data, error } = await this.client
      .from('games')
      .select(GAME_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) fail('get_game_failed', error.message);
    return data ? toGame(data as GameRow) : null;
  }

  async setGameOpen(id: string, isOpen: boolean): Promise<Game> {
    const { data, error } = await this.client
      .from('games')
      .update({ is_open: isOpen })
      .eq('id', id)
      .select(GAME_COLUMNS)
      .single();
    if (error || !data) fail('set_open_failed', error?.message);
    return toGame(data as GameRow);
  }

  async getGameBySlug(slug: string): Promise<Game | null> {
    const { data, error } = await this.client
      .from('games')
      .select(GAME_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    if (error) fail('get_game_failed', error.message);
    return data ? toGame(data as GameRow) : null;
  }

  async listPublicRsvps(gameId: string): Promise<PublicRsvp[]> {
    const { data, error } = await this.client
      .from('public_rsvps')
      .select('id, name, first_name, last_name, preferred_position, status')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    if (error) fail('list_rsvps_failed', error.message);
    return (data as Array<{
      id: string;
      name: string;
      first_name: string | null;
      last_name: string | null;
      preferred_position: string | null;
      status: RsvpStatus;
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      firstName: r.first_name,
      lastName: r.last_name,
      preferredPosition: r.preferred_position,
      status: r.status,
    }));
  }

  async createRsvp(gameId: string, input: RsvpInput): Promise<CreatedRsvp> {
    const clean = validateRsvpInput(input);
    const { data, error } = await this.client.rpc('create_rsvp', {
      p_game_id: gameId,
      p_first_name: clean.firstName,
      p_last_name: clean.lastName,
      p_preferred_position: clean.preferredPosition,
      p_status: clean.status,
    });
    if (error) fail('create_rsvp_failed', error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { rsvp_id: string; edit_token: string };
    if (!row?.rsvp_id || !row?.edit_token) fail('create_rsvp_failed', 'Could not save your RSVP.');
    return { rsvpId: row.rsvp_id, editToken: row.edit_token };
  }

  async getRsvpForEdit(rsvpId: string, token: string): Promise<EditableRsvp | null> {
    const { data, error } = await this.client.rpc('get_rsvp_for_edit', {
      p_rsvp_id: rsvpId,
      p_token: token,
    });
    if (error) fail('get_rsvp_failed', error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RpcRsvpRow | undefined;
    if (!row?.id) return null;
    return toEditable(row);
  }

  async updateRsvpByToken(rsvpId: string, token: string, input: RsvpInput): Promise<EditableRsvp> {
    const clean = validateRsvpInput(input);
    const { data, error } = await this.client.rpc('update_rsvp', {
      p_rsvp_id: rsvpId,
      p_token: token,
      p_first_name: clean.firstName,
      p_last_name: clean.lastName,
      p_preferred_position: clean.preferredPosition,
      p_status: clean.status,
    });
    if (error) fail('update_rsvp_failed', error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RpcRsvpRow | undefined;
    if (!row?.id) throw new RepositoryError('invalid_token', 'This edit link is not valid.');
    return toEditable(row);
  }

  async listRsvps(gameId: string): Promise<Rsvp[]> {
    const { data, error } = await this.client
      .from('rsvps')
      .select(RSVP_COLUMNS)
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    if (error) fail('list_rsvps_failed', error.message);
    return (data as RsvpRow[]).map(toRsvp);
  }

  async updateRsvpAdmin(rsvpId: string, name: string, status: RsvpStatus): Promise<Rsvp> {
    const clean = validate(name, status);
    const parts = splitFullName(clean);
    const { data, error } = await this.client
      .from('rsvps')
      .update({ name: clean, first_name: parts.firstName, last_name: parts.lastName, status })
      .eq('id', rsvpId)
      .select(RSVP_COLUMNS)
      .single();
    if (error || !data) fail('update_rsvp_failed', error?.message);
    return toRsvp(data as RsvpRow);
  }

  async deleteRsvpAdmin(rsvpId: string): Promise<void> {
    const { error } = await this.client.from('rsvps').delete().eq('id', rsvpId);
    if (error) fail('delete_rsvp_failed', error.message);
  }

  async getLineup(gameId: string): Promise<LineupState | null> {
    const { data, error } = await this.client
      .from('lineups')
      .select('state')
      .eq('game_id', gameId)
      .maybeSingle();
    if (error) fail('get_lineup_failed', error.message);
    return data ? ((data as { state: LineupState }).state ?? null) : null;
  }

  async saveLineup(gameId: string, state: LineupState): Promise<void> {
    const { error } = await this.client
      .from('lineups')
      .upsert({ game_id: gameId, state, updated_at: new Date().toISOString() }, { onConflict: 'game_id' });
    if (error) fail('save_lineup_failed', error.message);
  }
}
