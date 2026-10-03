// Messages between the parts of the extension (content script, background page, sidebar, full-page host view).
import type { Solutions } from '../../shared/answers';
import type { AcceptMode, Player, RacePhase, RaceResults, RoomState } from '../../shared/protocol';
import type { Puzzle } from '../../shared/puzzle';
import type { RaceSettings } from '../../shared/race';
import type { ReplayEvent } from '../../shared/replay';
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
  /** A note to show on the crossword's page, or null for none. */
  | { type: 'notice'; text: string | null }
  /** Letters to put into the site; '' clears a square. */
  | { type: 'apply'; cells: { cell: number; letter: string }[] };

export interface HostProfile {
  name: string;
  color: string;
}

export type Mode = 'coop' | 'race';

/** A crossword open on a site. */
export type PagePuzzle = { title: string; rows: number; cols: number } | null;

export interface SidebarStatus {
  mode: Mode;
  racePhase: RacePhase;
  /** The crossword being played. */
  pagePuzzle: PagePuzzle;
  /** A different crossword open in another tab, which the host can switch to. */
  otherPuzzle: PagePuzzle;
  /** Co-op, once the grid is solved (or full, without answers): whether it can be filled in on the site. */
  fillIn: 'ready' | 'no-tab' | 'done' | null;
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
  | { type: 'mode'; mode: Mode }
  | { type: 'accept-mode'; acceptMode: AcceptMode }
  /** Play the crossword open in another tab instead. */
  | { type: 'switch-puzzle' };

/** Everything the host's race view shows. */
export interface RaceViewStatus {
  host: HostProfile;
  session: { link: string; status: string } | null;
  /** The crossword being played: the one the next race will use. */
  pagePuzzle: PagePuzzle;
  /** A different crossword open in another tab, which the host can switch to. */
  otherPuzzle: PagePuzzle;
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
  | { type: 'race-settings'; settings: RaceSettings }
  | { type: 'start-race' }
  | { type: 'end-race' }
  | { type: 'new-race' };

/** Everything the full-page host view shows: the co-op state, the race, and the co-op replay. */
export interface FullViewStatus {
  sidebar: SidebarStatus;
  race: RaceViewStatus;
  replay: { events: ReplayEvent[]; durationMs: number };
}

/** Anything the sidebar or the full-page view can ask the background page to do. */
export type Command =
  | FromSidebar
  | FromRaceView
  /** The host typing on the full-page view: straight into the shared grid. */
  | { type: 'type'; cells: { cell: number; letter: string }[] }
  /** The clue the host has selected on the full-page view. */
  | { type: 'select'; clueId: string | null }
  /** The host suggesting rather than writing in, like a guest (all blank withdraws it). */
  | { type: 'suggest'; clueId: string; letters: string[] }
  /** Check these squares against the answers; `label` says what was checked ("1A", "the grid"). */
  | { type: 'check'; cells: number[]; label: string }
  /** Type the solved grid into the crossword on the site. */
  | { type: 'fill-site' };
