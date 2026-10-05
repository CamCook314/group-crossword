// What the host's screens show, and what they can ask the host engine to do.
import type { BracketCommand } from '../../../shared/games/bracket';
import type { ClueRaceCommand } from '../../../shared/games/clues';
import type { TriviaCommand } from '../../../shared/games/trivia';
import type { AcceptMode, GuestMessage, Mode, Player, RacePhase, RaceResults, RoomState } from '../../../shared/protocol';
import type { Puzzle } from '../../../shared/puzzle';
import type { RaceSettings } from '../../../shared/race';
import type { ReplayEvent } from '../../../shared/replay';
import type { RacerDetail } from './raceHost';

export interface HostProfile {
  name: string;
  color: string;
}

export type { Mode };

/** A crossword open on a site. */
export type PagePuzzle = { title: string; rows: number; cols: number } | null;

export type Session = { link: string; status: string } | null;

/** Co-op, as the host sees it. */
export interface HostStatus {
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
  session: Session;
  /** Answers for the current puzzle: how many squares, still reading, or not found. Null without a puzzle. */
  answers: number | 'reading' | 'none' | null;
  /** The last accepted suggestion, while it can still be undone. */
  undo: { playerIds: string[]; clueId: string } | null;
}

/** Everything the host's race view shows. */
export interface RaceViewStatus {
  host: HostProfile;
  session: Session;
  /** The crossword being played: the one the next race will use. */
  pagePuzzle: PagePuzzle;
  /** A different crossword open in another tab, which the host can switch to. */
  otherPuzzle: PagePuzzle;
  answers: HostStatus['answers'];
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

/** Everything the host's screens show: co-op, the race, and the co-op replay. */
export interface HostScreens {
  status: HostStatus;
  race: RaceViewStatus;
  replay: { events: ReplayEvent[]; durationMs: number };
  /** A word for the host from a game that needs no puzzle, shown for a moment. */
  note: { text: string; tone: 'good' | 'bad' | 'info'; at: number } | null;
}

/** Anything the host's screens can ask for. */
export type Command =
  | { type: 'start' }
  | { type: 'stop' }
  /** A suggestion card: everyone who suggested these exact letters for this clue. */
  | { type: 'accept' | 'reject'; clueId: string; letters: string[] }
  | { type: 'undo' }
  | { type: 'host'; host: HostProfile }
  | { type: 'mode'; mode: Mode }
  | { type: 'accept-mode'; acceptMode: AcceptMode }
  /** Play the crossword open in another tab instead. */
  | { type: 'switch-puzzle' }
  | { type: 'race-settings'; settings: RaceSettings }
  | { type: 'start-race' }
  | { type: 'end-race' }
  | { type: 'new-race' }
  /** The host typing: straight into the shared grid. */
  | { type: 'type'; cells: { cell: number; letter: string }[] }
  /** The clue the host has selected. */
  | { type: 'select'; clueId: string | null }
  /** The host suggesting rather than writing in, like a guest (all blank withdraws it). */
  | { type: 'suggest'; clueId: string; letters: string[] }
  /** Check these squares against the answers; `label` says what was checked ("1A", "the grid"). */
  | { type: 'check'; cells: number[]; label: string }
  /** Type the solved grid into the crossword on the site. */
  | { type: 'fill-site' }
  /** The host playing a game that needs no puzzle, as a player like everyone else. */
  | { type: 'play'; msg: Exclude<GuestMessage, { t: 'hello' }> }
  /** The host running a game that needs no puzzle. */
  | { type: 'clues'; cmd: ClueRaceCommand }
  | { type: 'trivia'; cmd: TriviaCommand }
  | { type: 'bracket'; cmd: BracketCommand };
