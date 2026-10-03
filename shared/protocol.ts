// Messages between the host's extension and the guests' pages.
import type { Puzzle } from './puzzle';
import type { RaceSettings } from './race';

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
  mode: 'coop' | 'race';
  /** In a race, only sent once the countdown starts. */
  puzzle: Puzzle | null;
  /** Co-op: letters on the host's real crossword, one per cell ('' = empty). */
  letters: string[];
  players: Player[];
  /** Co-op only. */
  suggestions: Suggestion[];
  /** Race only. */
  race: RaceState | null;
}

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'done';

/** What every racer sees about a race. Never includes answers until it's over. */
export interface RaceState {
  phase: RacePhase;
  settings: RaceSettings;
  /** Countdown: ms until the start. Racing or done: ms since the start. As of when this was sent. */
  clockMs: number;
  racers: RacerSummary[];
  results: RaceResults | null;
}

export interface RacerSummary {
  id: string;
  /** Squares filled, or null when the host hides racers' progress from each other. */
  filled: number | null;
  total: number;
  /** Time including penalties, once finished. */
  timeMs: number | null;
  penaltyMs: number;
  place: number | null;
}

export interface RaceResults {
  /** The winner's final grid, or the answers if nobody finished. */
  solution: string[];
  winner: string | null;
  /** Every racer's final grid. */
  boards: Record<string, string[]>;
}

export type HostMessage =
  | { t: 'state'; state: RoomState }
  | { t: 'rejected'; clueId: string }
  /** To a racer who rejoins mid-race: their grid so far. */
  | { t: 'race-letters'; letters: string[] }
  /** To a racer whose full grid is wrong: any penalty just added, and how long until another is possible. */
  | { t: 'not-quite'; penaltyMs: number; cooldownMs: number };

export type GuestMessage =
  | { t: 'hello'; clientId: string; name: string; color: string }
  | { t: 'select'; clueId: string | null }
  | { t: 'suggest'; clueId: string; letters: string[] }
  /** A racer's whole grid, whenever it changes. */
  | { t: 'race-letters'; letters: string[] };

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
    case 'race-letters':
      if (!Array.isArray(m.letters) || m.letters.length > 1000) return null;
      return { t: 'race-letters', letters: m.letters.map(normalizeLetter) };
    default:
      return null;
  }
}
