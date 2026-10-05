// The host's side of a game, run in the host's app tab: the shared grid, players, suggestions, checks, the co-op
// replay and races. It talks to guests through the session (session.ts), to puzzle pages through the connector
// (connector.ts), and to the host's screens through `changed`; it has no networking of its own, so it can be tested
// and saved.
import type { Solutions } from '../../../shared/answers';
import type { FromApp, PageSnapshot } from '../../../shared/connector';
import type { BracketMessage } from '../../../shared/games/bracket';
import type { ClueRaceMessage } from '../../../shared/games/clues';
import type { TriviaMessage } from '../../../shared/games/trivia';
import { normalizeLetter, type AcceptMode, type GuestMessage, type HostMessage, type Player, type RoomState, type Suggestion } from '../../../shared/protocol';
import { puzzleKey } from '../../../shared/puzzle';
import { isSolved, squareStatus } from '../../../shared/race';
import type { ReplayEvent } from '../../../shared/replay';
import { AGREED_BY, cellsToApply, groupSuggestions, pruneSuggestions, sameLetters, upsertSuggestion } from '../../../shared/suggestions';
import { BracketHost, type SavedBracket } from './games/bracketHost';
import { ClueRaceHost } from './games/cluesHost';
import { TriviaHost } from './games/triviaHost';
import { RaceHost, type SavedRace } from './raceHost';
import type { Command, HostProfile, HostScreens, HostStatus, Mode, PagePuzzle, Session } from './types';

export const HOST_ID = 'host';
const NOTICE = 'Group Crossword: this crossword is being played in your Group Crossword tab. It gets filled in here once it’s solved.';

export interface EngineIO {
  /** To everyone connected (including people still on the join screen), or to one player. */
  toGuests(msg: HostMessage, clientId?: string): void;
  toConnector(msg: FromApp): void;
  /** Something changed: redraw the host's screens, and save. */
  changed(): void;
}

/** What a game needs to carry on after the host's tab reloads. Puzzle pages report themselves again. */
export interface SavedEngine {
  mode: Mode;
  page: PageSnapshot | null;
  grid: string[];
  fromSite: boolean;
  wrong: number[];
  check: RoomState['check'];
  hostClueId: string | null;
  answers: [string, Solutions | null][];
  guests: Player[];
  suggestions: Suggestion[];
  lastAccept: HostEngine['lastAccept'];
  autoAccepted: string[];
  history: HostEngine['history'];
  race: SavedRace;
  clues: unknown;
  trivia: unknown;
  bracket: SavedBracket;
}

export class HostEngine {
  host: HostProfile;
  acceptMode: AcceptMode;
  session: Session = null;
  private mode: Mode = 'coop';
  /** Every puzzle page open, the one that reported most recently last. */
  private pages = new Map<string, PageSnapshot>();
  /** The puzzle being played, as its page last showed it. Opening another puzzle doesn't change it. */
  private page: PageSnapshot | null = null;
  /**
   * Co-op: the shared grid. It follows the site's letters until play starts here (the first letter written or
   * accepted); after that the site is left alone until the host fills it in.
   */
  private grid: string[] = [];
  private fromSite = true;
  /** Co-op: squares the host checked and found wrong, and the latest check. */
  private wrong = new Set<number>();
  private check: RoomState['check'] = null;
  /** The clue the host has selected. */
  private hostClueId: string | null = null;
  /** Answers by puzzle key, as the pages read them. Kept here only: never part of the room state. */
  private answers = new Map<string, Solutions | null>();
  private guests = new Map<string, Player>();
  private suggestions: Suggestion[] = [];
  /** What the last accepted suggestion changed in the grid, so it can be undone. */
  private lastAccept: { playerIds: string[]; clueId: string; changes: { cell: number; before: string; after: string }[] } | null = null;
  /** Suggestion cards already put in automatically (clue + letters), so they're never put in twice. */
  private autoAccepted = new Set<string>();
  /** The co-op solve so far, for the replay: every letter change in the grid and who made it. */
  private history: { startedAt: number | null; events: ReplayEvent[] } = { startedAt: null, events: [] };
  /** The notice last sent to each page, so it's only sent when it changes. */
  private notices = new Map<string, string | null>();
  readonly race: RaceHost;
  /** The games that need no puzzle. */
  private readonly clues: ClueRaceHost;
  private readonly trivia: TriviaHost;
  private readonly bracket = new BracketHost();
  /** A word for the host only, from one of those games, shown for a moment. */
  private hostNote: HostScreens['note'] = null;

  constructor(
    private io: EngineIO,
    settings: { host: HostProfile; acceptMode: AcceptMode },
  ) {
    this.host = settings.host;
    this.acceptMode = settings.acceptMode;
    this.race = new RaceHost(() => this.update());
    const games = {
      changed: () => this.update(),
      tell: (playerId: string, text: string, tone: 'good' | 'bad' | 'info') => {
        if (playerId === HOST_ID) this.hostNote = { text, tone, at: Date.now() };
        else this.io.toGuests({ t: 'note', text, tone }, playerId);
      },
    };
    this.clues = new ClueRaceHost(games);
    this.trivia = new TriviaHost(games);
  }

  save(): SavedEngine {
    return {
      mode: this.mode,
      page: this.page,
      grid: this.grid,
      fromSite: this.fromSite,
      wrong: [...this.wrong],
      check: this.check,
      hostClueId: this.hostClueId,
      answers: [...this.answers],
      guests: [...this.guests.values()],
      suggestions: this.suggestions,
      lastAccept: this.lastAccept,
      autoAccepted: [...this.autoAccepted],
      history: this.history,
      race: this.race.save(),
      clues: this.clues.save(),
      trivia: this.trivia.save(),
      bracket: this.bracket.save(),
    };
  }

  /** Carries on from a save. Everyone shows as away until they reconnect. */
  restore(saved: SavedEngine, now: number) {
    this.mode = saved.mode;
    this.page = saved.page;
    this.grid = saved.grid;
    this.fromSite = saved.fromSite;
    this.wrong = new Set(saved.wrong);
    this.check = saved.check;
    this.hostClueId = saved.hostClueId;
    this.answers = new Map(saved.answers);
    this.guests = new Map(saved.guests.map(p => [p.id, { ...p, online: false }]));
    this.suggestions = saved.suggestions;
    this.lastAccept = saved.lastAccept;
    this.autoAccepted = new Set(saved.autoAccepted);
    this.history = saved.history;
    this.race.restore(saved.race, now);
    this.clues.restore(saved.clues);
    this.trivia.restore(saved.trivia);
    if (saved.bracket) this.bracket.restore(saved.bracket);
  }

  private samePuzzle = (p: PageSnapshot) => Boolean(this.page) && puzzleKey(p.puzzle) === puzzleKey(this.page!.puzzle);
  private solutions = () => (this.page && this.answers.get(puzzleKey(this.page.puzzle))) ?? null;
  /** The open page showing the puzzle being played, if any. */
  private sitePage = () => [...this.pages].reverse().find(([, p]) => this.samePuzzle(p))?.[0] ?? null;
  /** The latest other puzzle open, if any. */
  private otherPage = () => [...this.pages.values()].reverse().find(p => !this.samePuzzle(p)) ?? null;
  private onlineIds = () => [...this.guests.values()].filter(p => p.online).map(p => p.id);
  /** Everyone playing a game that needs no puzzle: the host plays too. */
  private players = () => [HOST_ID, ...this.onlineIds()];
  private hostPlayer = (): Player => ({ id: HOST_ID, ...this.host, clueId: this.hostClueId ?? this.page?.clueId ?? null, host: true, online: true });
  private replay = () => ({ events: this.history.events, durationMs: this.history.events.at(-1)?.at ?? 0 });

  roomState(): RoomState {
    const { mode } = this;
    if (mode === 'clues' || mode === 'trivia' || mode === 'bracket') {
      return {
        mode,
        acceptMode: this.acceptMode,
        puzzle: null,
        letters: [],
        players: [this.hostPlayer(), ...this.guests.values()],
        suggestions: [],
        wrong: [],
        check: null,
        finished: null,
        race: null,
        [mode]: this[mode].state(),
      };
    }
    if (this.mode === 'race') {
      return {
        mode: this.mode,
        acceptMode: 'manual',
        puzzle: this.race.puzzle, // only set once the countdown starts
        letters: [],
        players: [...this.guests.values()],
        suggestions: [],
        wrong: [],
        check: null,
        finished: null,
        race: this.race.stateForRacers(Date.now()),
      };
    }
    return {
      mode: this.mode,
      acceptMode: this.acceptMode,
      puzzle: this.page?.puzzle ?? null,
      letters: this.grid,
      players: [this.hostPlayer(), ...this.guests.values()],
      suggestions: this.suggestions,
      wrong: [...this.wrong],
      check: this.check,
      finished: this.finished(),
      race: null,
    };
  }

  /** Once every square is filled: solved, wrong, or just full when there are no answers to check. */
  private finished(): RoomState['finished'] {
    if (!this.page || this.page.puzzle.blocks.some((block, cell) => !block && !this.grid[cell])) return null;
    const s = this.solutions();
    return !s ? 'full' : isSolved(s, this.grid) ? 'solved' : 'wrong';
  }

  private fillIn(): HostStatus['fillIn'] {
    const done = this.finished();
    const page = this.page;
    if (this.mode !== 'coop' || !page || (done !== 'solved' && done !== 'full')) return null;
    if (this.grid.every((letter, cell) => page.letters[cell] === letter)) return 'done';
    return this.sitePage() ? 'ready' : 'no-tab';
  }

  private answerStatus(): HostStatus['answers'] {
    if (!this.page) return null;
    const key = puzzleKey(this.page.puzzle);
    if (!this.answers.has(key)) return 'reading';
    const s = this.answers.get(key);
    return s ? s[0].filter(Boolean).length : 'none';
  }

  screens(): HostScreens {
    const pagePuzzle = summary(this.page);
    const otherPuzzle = summary(this.otherPage());
    const answers = this.answerStatus();
    const status: HostStatus = {
      mode: this.mode,
      racePhase: this.race.phase,
      pagePuzzle,
      otherPuzzle,
      fillIn: this.fillIn(),
      state: this.roomState(),
      host: this.host,
      session: this.session,
      undo: this.lastAccept && { playerIds: this.lastAccept.playerIds, clueId: this.lastAccept.clueId },
      answers,
    };
    const { race } = this;
    return {
      status,
      race: {
        host: this.host,
        session: this.session,
        pagePuzzle,
        otherPuzzle,
        answers,
        phase: race.phase,
        settings: race.settings,
        puzzle: race.puzzle,
        goAt: race.goAt,
        endedAt: race.endedAt,
        players: [...this.guests.values()],
        racers: race.details(),
        results: race.results,
      },
      replay: this.replay(),
      note: this.hostNote,
    };
  }

  /** Pushes the current state everywhere. Called after every change. */
  update() {
    this.autoAccept();
    this.suggestions = pruneSuggestions(this.suggestions, this.page?.puzzle ?? null, this.grid);
    this.io.toGuests({ t: 'state', state: this.roomState() });
    // Racers who have finished know every answer, so they can watch everyone else's grid.
    if (this.race.running) {
      const details = this.race.details();
      const boards = details.map(({ id, letters, status }) => ({ id, letters, status }));
      for (const r of details) if (r.finishedAt !== null) this.io.toGuests({ t: 'race-boards', boards }, r.id);
    }
    // Once play has moved here, the puzzle's own page says so.
    for (const [pageId, p] of this.pages) {
      const text = this.mode === 'coop' && !this.fromSite && this.samePuzzle(p) ? NOTICE : null;
      if (this.notices.get(pageId) === text) continue;
      this.notices.set(pageId, text);
      this.io.toConnector({ type: 'notice', pageId, text });
    }
    this.io.changed();
  }

  /** Puts letters into the shared grid ('' clears), crediting them to `by` in the replay. */
  private setLetters(cells: { cell: number; letter: string }[], by: string) {
    if (!this.page) return;
    const blocks = this.page.puzzle.blocks;
    const changed = cells.filter(({ cell, letter }) => cell >= 0 && cell < blocks.length && !blocks[cell] && this.grid[cell] !== letter);
    if (!changed.length) return;
    // A new grid rather than changing it in place: the host's screens, in this same page, compare it to the last one.
    this.grid = [...this.grid];
    for (const { cell, letter } of changed) {
      this.grid[cell] = letter;
      this.wrong.delete(cell);
    }
    const now = Date.now();
    this.history.startedAt ??= now;
    const event: ReplayEvent = { at: now - this.history.startedAt, board: 'shared', by, cells: changed.map(({ cell, letter }) => [cell, letter]) };
    this.history = { ...this.history, events: [...this.history.events, event] };
  }

  /** Starts playing a puzzle: the grid as the site shows it, and nothing left over from the last one. */
  private usePuzzle(snapshot: PageSnapshot) {
    this.page = snapshot;
    this.grid = snapshot.puzzle.blocks.map(() => '');
    this.fromSite = true;
    this.suggestions = [];
    this.lastAccept = null;
    this.autoAccepted = new Set();
    this.wrong = new Set();
    this.check = null;
    this.hostClueId = null;
    this.history = { startedAt: null, events: [] };
    // Letters already there open the replay.
    this.setLetters(snapshot.letters.map((letter, cell) => ({ cell, letter })), HOST_ID);
  }

  // --- From the connector ---

  pageReport(pageId: string, snapshot: PageSnapshot) {
    this.pages.delete(pageId); // so the most recent report comes last
    this.pages.set(pageId, snapshot);
    if (this.page && this.samePuzzle(snapshot)) {
      this.page = snapshot;
      if (this.fromSite) this.setLetters(snapshot.letters.map((letter, cell) => ({ cell, letter })), HOST_ID);
    } else if (!this.page || (!this.session && this.fromSite && !this.race.running)) {
      // Before anyone is playing, follow whichever puzzle the host opens; after that it's offered to switch to.
      this.usePuzzle(snapshot);
    }
    this.update();
  }

  /** The puzzle being played stays as it was if its page goes away (e.g. the host reloads it). */
  pageClosed(pageId: string) {
    this.pages.delete(pageId);
    this.notices.delete(pageId);
    this.update();
  }

  pageAnswers(key: string, solutions: Solutions | null) {
    this.answers.set(key, solutions);
    this.update();
  }

  // --- From the session ---

  guestHello(clientId: string, name: string, color: string) {
    const previous = this.guests.get(clientId);
    this.guests.set(clientId, { id: clientId, name, color, clueId: previous?.clueId ?? null, host: false, online: true });
    // Joining mid-race: a late joiner starts empty; someone coming back gets their grid back (sent after the state,
    // which carries the puzzle).
    const restore = this.mode === 'race' ? this.race.join(clientId) : null;
    this.update();
    if (restore) this.io.toGuests({ t: 'race-letters', letters: restore }, clientId);
  }

  guestLeft(clientId: string) {
    const player = this.guests.get(clientId);
    if (player) player.online = false;
    if (this.race.running && this.race.allFinished(this.onlineIds())) this.race.end(Date.now());
    this.update();
  }

  guestMessage(clientId: string, msg: Exclude<GuestMessage, { t: 'hello' }>) {
    // The games that need no puzzle, which the host plays too.
    if (clientId === HOST_ID || this.guests.has(clientId)) {
      if (msg.t.startsWith('clues-')) return this.inGame('clues', () => this.clues.message(clientId, msg as ClueRaceMessage, this.players()));
      if (msg.t.startsWith('trivia-')) return this.inGame('trivia', () => this.trivia.message(clientId, msg as TriviaMessage, this.players()));
      if (msg.t.startsWith('bracket-')) return this.inGame('bracket', () => this.bracket.message(clientId, msg as BracketMessage, this.players()));
    }
    const player = this.guests.get(clientId);
    if (!player) return;
    if (msg.t === 'get-replay') return this.io.toGuests({ t: 'replay', ...this.replay() }, clientId);
    if (this.mode === 'coop') {
      if (msg.t === 'select') player.clueId = msg.clueId;
      if (msg.t === 'suggest') this.suggestions = upsertSuggestion(this.suggestions, { playerId: player.id, clueId: msg.clueId, letters: msg.letters });
    }
    if (this.mode === 'race' && msg.t === 'race-letters') {
      const now = Date.now();
      const notQuite = this.race.letters(player.id, msg.letters, now);
      if (notQuite) this.io.toGuests({ t: 'not-quite', ...notQuite }, player.id);
      if (this.race.allFinished(this.onlineIds())) this.race.end(now);
    }
    this.update();
  }

  /** Runs a game's move if that game is being played. */
  private inGame(mode: Mode, move: () => void) {
    if (this.mode !== mode) return;
    move();
    this.update();
  }

  /** The session ended: everyone's gone, and so are their suggestions and any race. */
  sessionStopped() {
    this.session = null;
    this.guests.clear();
    this.suggestions = [];
    this.lastAccept = null;
    this.race.reset();
    this.update();
  }

  // --- From the host's screens ---

  /** Puts a suggestion card (everyone who suggested these letters for this clue) into the grid. */
  private acceptGroup(clueId: string, letters: string[]): boolean {
    const group = this.suggestions.filter(x => x.clueId === clueId && sameLetters(x.letters, letters));
    if (!group.length || !this.page) return false;
    const changes = cellsToApply(this.page.puzzle, group[0])
      .map(({ cell, letter }) => ({ cell, before: this.grid[cell], after: letter }))
      .filter(c => c.before !== c.after);
    this.lastAccept = changes.length ? { playerIds: group.map(x => x.playerId), clueId, changes } : null;
    this.fromSite = false;
    this.setLetters(
      changes.map(c => ({ cell: c.cell, letter: c.after })),
      group.length > 1 ? AGREED_BY : group[0].playerId,
    );
    return true;
  }

  /** Accepts cards automatically when the host has chosen to: once two or more agree, or always (trusted). */
  private autoAccept() {
    if (this.mode !== 'coop' || this.acceptMode === 'manual') return;
    const groups = groupSuggestions(this.suggestions);
    const key = (g: { clueId: string; letters: string[] }) => `${g.clueId}:${g.letters.join(',')}`;
    this.autoAccepted = new Set([...this.autoAccepted].filter(k => groups.some(g => key(g) === k)));
    for (const g of groups) {
      // The host suggests when unsure, so their suggestions wait for someone to agree, even with trusted friends.
      const needsTwo = this.acceptMode === 'agreed' || g.playerIds.includes(HOST_ID);
      if (this.autoAccepted.has(key(g)) || (needsTwo && g.playerIds.length < 2)) continue;
      if (this.acceptGroup(g.clueId, g.letters)) this.autoAccepted.add(key(g));
    }
  }

  /** Everything the screens can ask for except starting and stopping the session, which the session does. */
  command(msg: Exclude<Command, { type: 'start' | 'stop' }>) {
    const now = Date.now();
    switch (msg.type) {
      case 'host':
        this.host = msg.host;
        return this.update();
      case 'mode':
        if (this.race.running) return; // finish or end the race first
        this.mode = msg.mode;
        this.race.reset();
        return this.update();
      case 'accept-mode':
        this.acceptMode = msg.acceptMode;
        return this.update();
      case 'switch-puzzle': {
        const other = this.otherPage();
        if (!other || this.race.running) return;
        this.usePuzzle(other);
        return this.update();
      }
      case 'accept':
        this.acceptGroup(msg.clueId, msg.letters);
        return this.update();
      case 'undo':
        if (!this.lastAccept) return;
        // Only put back squares that still hold what the accept put in, so later changes aren't lost.
        this.setLetters(
          this.lastAccept.changes.filter(c => this.grid[c.cell] === c.after).map(c => ({ cell: c.cell, letter: c.before })),
          HOST_ID,
        );
        this.lastAccept = null;
        return this.update();
      case 'reject': {
        const inGroup = (x: Suggestion) => x.clueId === msg.clueId && sameLetters(x.letters, msg.letters);
        for (const x of this.suggestions.filter(inGroup)) this.io.toGuests({ t: 'rejected', clueId: msg.clueId }, x.playerId);
        this.suggestions = this.suggestions.filter(x => !inGroup(x));
        return this.update();
      }
      case 'type':
        if (this.mode !== 'coop') return;
        this.fromSite = false;
        this.setLetters(
          msg.cells.map(c => ({ cell: c.cell, letter: normalizeLetter(c.letter) })),
          HOST_ID,
        );
        return this.update();
      case 'select':
        this.hostClueId = msg.clueId;
        return this.update();
      case 'suggest':
        if (this.mode !== 'coop' || !this.page?.puzzle.clues.some(c => c.id === msg.clueId)) return;
        this.suggestions = upsertSuggestion(this.suggestions, { playerId: HOST_ID, clueId: msg.clueId, letters: msg.letters.map(normalizeLetter) });
        return this.update();
      case 'check': {
        const s = this.solutions();
        if (this.mode !== 'coop' || !s) return;
        const status = squareStatus(s, this.grid);
        const found = msg.cells.filter(cell => status[cell] === 'wrong');
        for (const cell of msg.cells) this.wrong.delete(cell);
        for (const cell of found) this.wrong.add(cell);
        this.check = { label: msg.label, wrong: found.length, at: now };
        return this.update();
      }
      case 'fill-site': {
        const pageId = this.sitePage();
        const page = this.page;
        if (!pageId || !page || this.fillIn() !== 'ready') return;
        const cells = this.grid.map((letter, cell) => ({ cell, letter })).filter(({ cell, letter }) => !page.puzzle.blocks[cell] && page.letters[cell] !== letter);
        return this.io.toConnector({ type: 'fill', pageId, cells });
      }
      case 'race-settings': {
        if (this.race.running) return;
        const penaltySeconds = Math.max(0, Math.min(600, Math.round(Number(msg.settings.penaltySeconds) || 0)));
        this.race.settings = { showOthersProgress: Boolean(msg.settings.showOthersProgress), penaltySeconds };
        return this.update();
      }
      case 'start-race': {
        // A race uses the puzzle being played, and needs its answers and someone to race.
        const s = this.solutions();
        if (this.mode !== 'race' || this.race.running || !this.session || !this.page || !s || !this.onlineIds().length) return;
        this.race.start(this.page.puzzle, s, this.onlineIds(), now);
        return this.update();
      }
      case 'end-race':
        this.race.end(now);
        return this.update();
      case 'play':
        return this.guestMessage(HOST_ID, msg.msg);
      case 'clues':
        return this.inGame('clues', () => this.clues.command(msg.cmd, this.players()));
      case 'trivia':
        return this.inGame('trivia', () => this.trivia.command(msg.cmd, this.players()));
      case 'bracket':
        return this.inGame('bracket', () => this.bracket.command(msg.cmd));
      case 'new-race':
        if (this.race.running) return;
        this.race.reset();
        return this.update();
    }
  }
}

const summary = (p: PageSnapshot | null): PagePuzzle => p && { title: p.puzzle.title, rows: p.puzzle.rows, cols: p.puzzle.cols };
