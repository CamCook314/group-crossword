// Messages between the parts of the extension (content script, background page, sidebar).
import type { Solutions } from '../../shared/answers';
import type { Player, RacePhase, RaceResults, RoomState } from '../../shared/protocol';
import type { Puzzle } from '../../shared/puzzle';
import type { RaceSettings } from '../../shared/race';
import type { RacerDetail } from './raceHost';

/** What a crossword page currently shows. Sent by the content script whenever it changes. */
export interface PageSnapshot {
  puzzle: Puzzle;
  letters: string[];
  /** The clue the host has selected on the site. */
  clueId: string | null;
}

export type FromAdapter =
  | ({ type: 'page' } & PageSnapshot)
  /** The answers for the puzzle with this puzzleKey, or null if they couldn't be read. Never sent on to guests. */
  | { type: 'answers'; puzzleKey: string; solutions: Solutions | null };

export type ToAdapter =
  | { type: 'overlay'; state: RoomState | null }
  /** Letters to put into the site; '' clears a square. */
  | { type: 'apply'; cells: { cell: number; letter: string }[] };

export interface HostProfile {
  name: string;
  color: string;
}

export type Mode = 'coop' | 'race';

/** The crossword open on the site. */
export type PagePuzzle = { title: string; rows: number; cols: number } | null;

export interface SidebarStatus {
  mode: Mode;
  racePhase: RacePhase;
  pagePuzzle: PagePuzzle;
  state: RoomState;
  host: HostProfile;
  session: { link: string; status: string } | null;
  /** Answers for the current puzzle: how many squares, still reading, or not found. Null without a puzzle. */
  answers: number | 'reading' | 'none' | null;
  /** The last accepted suggestion, while it can still be undone. */
  undo: { playerIds: string[]; clueId: string } | null;
}

export type FromSidebar =
  | { type: 'start' }
  | { type: 'stop' }
  /** A suggestion card: everyone who suggested these exact letters for this clue. */
  | { type: 'accept' | 'reject'; clueId: string; letters: string[] }
  | { type: 'undo' }
  | { type: 'host'; host: HostProfile }
  | { type: 'mode'; mode: Mode };

/** Everything the host's race view shows. */
export interface RaceViewStatus {
  host: HostProfile;
  session: { link: string; status: string } | null;
  /** The crossword open on the site: the one the next race will use. */
  pagePuzzle: PagePuzzle;
  answers: SidebarStatus['answers'];
  phase: RacePhase;
  settings: RaceSettings;
  /** The race's puzzle, fixed when it started. */
  puzzle: Puzzle | null;
  goAt: number | null;
  endedAt: number | null;
  /** Everyone who has joined (not the host). */
  players: Player[];
  racers: RacerDetail[];
  results: RaceResults | null;
}

export type FromRaceView =
  | { type: 'start-session' }
  | { type: 'settings'; settings: RaceSettings }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'new-race' };
