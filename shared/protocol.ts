// Messages between the host's extension and the guests' pages.
import { parseBracketMessage, type BracketMessage, type BracketState } from './games/bracket';
import { parseClueRaceMessage, type ClueRaceMessage, type ClueRaceState } from './games/clues';
import { parseTriviaMessage, type TriviaMessage, type TriviaState } from './games/trivia';
import type { Puzzle } from './puzzle';
import type { RaceSettings, Standing } from './race';
import type { ReplayEvent } from './replay';

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

/** How friends' suggestions get onto the crossword in co-op: when the host accepts them, automatically once two or more
 * people agree, or automatically (trusted). */
export type AcceptMode = 'manual' | 'agreed' | 'trusted';

/** What the room is playing: a puzzle together (co-op) or against each other (race), or a game that needs no puzzle. */
export type Mode = 'coop' | 'race' | 'clues' | 'trivia' | 'bracket';

export interface RoomState {
  mode: Mode;
  acceptMode: AcceptMode;
  /** In a race, only sent once the countdown starts. */
  puzzle: Puzzle | null;
  /** Co-op: the shared grid, one letter per cell ('' = empty). */
  letters: string[];
  players: Player[];
  /** Co-op only. */
  suggestions: Suggestion[];
  /** Co-op: squares the host checked and found wrong, until they change. */
  wrong: number[];
  /** Co-op: the host's latest check, so everyone sees how it went. */
  check: { label: string; wrong: number; at: number } | null;
  /** Co-op: once every square is filled, whether it's right ('full' when there are no answers to tell). */
  finished: 'solved' | 'wrong' | 'full' | null;
  /** Sudoku: the pencil marks players have chosen to share, by player id. */
  marks?: Record<string, PencilMarks>;
  /** Race only. */
  race: RaceState | null;
  /** The games that need no puzzle, each in its own mode. */
  clues?: ClueRaceState;
  trivia?: TriviaState;
  bracket?: BracketState;
}

/** A player's sudoku pencil marks: the digits noted in each square's corners and centre. */
export interface PencilMarks {
  corner: Record<number, string>;
  centre: Record<number, string>;
}

/** A racer's grid, for racers who have finished to watch the others. */
export interface RacerBoard {
  id: string;
  letters: string[];
  status: ('' | 'right' | 'wrong')[];
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
  /** Everyone, finishers first by time, then the rest by squares correct. */
  standings: Standing[];
  /** Every racer's grid changes, for watching the race back. */
  replay: ReplayEvent[];
  durationMs: number;
}

export type HostMessage =
  | { t: 'state'; state: RoomState }
  | { t: 'rejected'; clueId: string }
  /** To a racer who rejoins mid-race: their grid so far. */
  | { t: 'race-letters'; letters: string[] }
  /** To a racer whose full grid is wrong: any penalty just added, and how long until another is possible. */
  | { t: 'not-quite'; penaltyMs: number; cooldownMs: number }
  /** The co-op solve so far, for watching it back (asked for with get-replay). */
  | { t: 'replay'; events: ReplayEvent[]; durationMs: number }
  /** To racers who have finished: everyone's grid, live. */
  | { t: 'race-boards'; boards: RacerBoard[] }
  /** A word for one player only, shown for a moment (e.g. "Not it, try again"). */
  | { t: 'note'; text: string; tone: 'good' | 'bad' | 'info' };

export type GuestMessage =
  | { t: 'hello'; clientId: string; name: string; color: string }
  | { t: 'select'; clueId: string | null }
  /** Merged into the player's earlier suggestion for the clue; all blank withdraws it. */
  | { t: 'suggest'; clueId: string; letters: string[] }
  /** A racer's whole grid, whenever it changes. */
  | { t: 'race-letters'; letters: string[] }
  | { t: 'get-replay' }
  | ClueRaceMessage
  | TriviaMessage
  | BracketMessage;

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
    case 'get-replay':
      return { t: 'get-replay' };
    default:
      return parseClueRaceMessage(m) ?? parseTriviaMessage(m) ?? parseBracketMessage(m);
  }
}
