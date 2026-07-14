export type RsvpStatus = 'yes' | 'maybe' | 'no';

export const RSVP_STATUSES: readonly RsvpStatus[] = ['yes', 'maybe', 'no'];

export const STATUS_LABEL: Record<RsvpStatus, string> = {
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No',
};

export interface Game {
  id: string;
  slug: string;
  opponent: string;
  matchDate: string;
  matchTime: string;
  venue: string;
  teamColor: string;
  isOpen: boolean;
  createdAt: string;
}

export interface GameInput {
  opponent: string;
  matchDate: string;
  matchTime: string;
  venue: string;
  teamColor: string;
}

export interface Rsvp {
  id: string;
  gameId: string;
  name: string;
  status: RsvpStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRsvp {
  id: string;
  name: string;
  status: RsvpStatus;
}

export interface CreatedRsvp {
  rsvpId: string;
  editToken: string;
}

export interface EditableRsvp {
  id: string;
  name: string;
  status: RsvpStatus;
}

export interface AdminSession {
  userId: string;
  email: string;
}

export interface LineupPlayer {
  id: string;
  name: string;
  pos: string;
  starter: boolean;
  manual: boolean;
  rsvpId: string | null;
}

export interface Coord {
  x: number;
  y: number;
}

export interface LineupState {
  formation: string;
  players: LineupPlayer[];
  customPositions: Record<string, Coord>;
  slotOverrides: Record<string, number>;
}

export function emptyLineup(formation: string): LineupState {
  return { formation, players: [], customPositions: {}, slotOverrides: {} };
}
