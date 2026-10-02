// Messages between the host's extension and the guests' pages.
import type { Puzzle } from './puzzle';

export const GUEST_URL = 'https://camcook314.github.io/group-crossword/';

export const COLORS = ['#1f77b4', '#d62728', '#2ca02c', '#ff7f0e', '#9467bd', '#e377c2', '#8c564b', '#17becf'];

export interface Player {
  id: string;
  name: string;
  color: string;
  /** The clue this player has selected. */
  clueId: string | null;
  host: boolean;
  online: boolean;
}

export interface Suggestion {
  playerId: string;
  clueId: string;
  /** One per cell of the clue; '' = left blank. */
  letters: string[];
}

export interface RoomState {
  puzzle: Puzzle | null;
  /** Letters on the host's real crossword, one per cell ('' = empty). */
  letters: string[];
  players: Player[];
  suggestions: Suggestion[];
}

export type HostMessage = { t: 'state'; state: RoomState } | { t: 'rejected'; clueId: string };

export type GuestMessage =
  | { t: 'hello'; clientId: string; name: string; color: string }
  | { t: 'select'; clueId: string | null }
  | { t: 'suggest'; clueId: string; letters: string[] };

export const normalizeLetter = (s: unknown) => (typeof s === 'string' && /^[a-z]$/i.test(s) ? s.toUpperCase() : '');

const isClueId = (s: unknown): s is string => typeof s === 'string' && /^\d{1,3}[AD]$/.test(s);

/** Validates a message arriving from a guest; returns null if it's malformed. */
export function parseGuestMessage(data: unknown): GuestMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      if (typeof m.clientId !== 'string' || !/^[\w-]{8,64}$/.test(m.clientId)) return null;
      if (typeof m.name !== 'string' || typeof m.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(m.color)) return null;
      return { t: 'hello', clientId: m.clientId, name: m.name.trim().slice(0, 24) || 'Guest', color: m.color };
    case 'select':
      return m.clueId === null || isClueId(m.clueId) ? { t: 'select', clueId: m.clueId } : null;
    case 'suggest':
      if (!isClueId(m.clueId) || !Array.isArray(m.letters) || m.letters.length > 30) return null;
      return { t: 'suggest', clueId: m.clueId, letters: m.letters.map(normalizeLetter) };
    default:
      return null;
  }
}
