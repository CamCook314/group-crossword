// The host's hub: holds the session and the shared grid, talks to the guests over WebRTC, to the crossword pages, the
// sidebar and the full-page host view.
import { Peer, type DataConnection } from 'peerjs';
import type { Solutions } from '../../shared/answers';
import {
  COLORS,
  GUEST_URL,
  normalizeLetter,
  parseGuestMessage,
  type AcceptMode,
  type HostMessage,
  type Player,
  type RoomState,
  type Suggestion,
} from '../../shared/protocol';
import { puzzleKey } from '../../shared/puzzle';
import { isSolved, squareStatus } from '../../shared/race';
import type { ReplayEvent } from '../../shared/replay';
import { AGREED_BY, cellsToApply, groupSuggestions, pruneSuggestions, sameLetters, upsertSuggestion } from '../../shared/suggestions';
import { type Command, type FromAdapter, type FullViewStatus, type HostProfile, type Mode, type PageSnapshot, type RaceViewStatus, type SidebarStatus, type ToAdapter } from './messages';
import { RaceHost } from './raceHost';

const HOST_ID = 'host';
const NOTICE = 'Group Crossword: this crossword is being played in the full view. It gets filled in here once it’s solved.';

interface Session {
  roomId: string;
  peer: Peer;
  status: string;
  /** Open connections -> the guest's clientId (known once they've said hello). */
  conns: Map<DataConnection, string | null>;
}

let host: HostProfile = { name: 'Host', color: COLORS[0] };
let acceptMode: AcceptMode = 'manual';
/** Every crossword page open, the one that reported most recently last. */
const pages = new Map<browser.runtime.Port, PageSnapshot>();
/** The crossword being played, as its page last showed it. Opening another crossword doesn't change it. */
let page: PageSnapshot | null = null;
/**
 * Co-op: the shared grid. It follows the site's letters until play starts here (the first letter written or accepted);
 * after that the site is left alone until the host fills it in.
 */
let grid: string[] = [];
let fromSite = true;
/** Co-op: squares the host checked and found wrong, and the latest check. */
let wrong = new Set<number>();
let check: RoomState['check'] = null;
/** The clue the host has selected on the full view. */
let hostClueId: string | null = null;
/** Answers by puzzle key, as the pages read them. Kept here only: never part of the room state. */
const answers = new Map<string, Solutions | null>();
const sidebars = new Set<browser.runtime.Port>();
const fullViews = new Set<browser.runtime.Port>();
let mode: Mode = 'coop';
const race = new RaceHost(() => update());
const guests = new Map<string, Player>();
let suggestions: Suggestion[] = [];
let session: Session | null = null;
/** What the last accepted suggestion changed in the grid, so it can be undone. */
let lastAccept: { playerIds: string[]; clueId: string; changes: { cell: number; before: string; after: string }[] } | null = null;
/** Suggestion cards already put in automatically (clue + letters), so they're never put in twice. */
let autoAccepted = new Set<string>();
/** The co-op solve so far, for the replay: every letter change in the grid and who made it. */
let history: { startedAt: number | null; events: ReplayEvent[] } = { startedAt: null, events: [] };

browser.storage.local.get(['host', 'acceptMode']).then(stored => {
  if (stored.host) host = stored.host as HostProfile;
  if (stored.acceptMode) acceptMode = stored.acceptMode as AcceptMode;
  update();
});

const samePuzzle = (p: PageSnapshot) => Boolean(page) && puzzleKey(p.puzzle) === puzzleKey(page!.puzzle);
const solutions = () => (page && answers.get(puzzleKey(page.puzzle))) ?? null;
/** The open page showing the crossword being played, if any. */
const sitePort = () => [...pages].reverse().find(([, p]) => samePuzzle(p))?.[0] ?? null;
/** The latest other crossword open, if any. */
const otherPage = () => [...pages.values()].reverse().find(p => !samePuzzle(p)) ?? null;
const pagePuzzle = (p: PageSnapshot | null) => p && { title: p.puzzle.title, rows: p.puzzle.rows, cols: p.puzzle.cols };

function roomState(): RoomState {
  if (mode === 'race') {
    return {
      mode,
      acceptMode: 'manual',
      puzzle: race.puzzle, // only set once the countdown starts
      letters: [],
      players: [...guests.values()],
      suggestions: [],
      wrong: [],
      check: null,
      finished: null,
      race: race.stateForRacers(Date.now()),
    };
  }
  return {
    mode,
    acceptMode,
    puzzle: page?.puzzle ?? null,
    letters: grid,
    players: [{ id: HOST_ID, ...host, clueId: hostClueId ?? page?.clueId ?? null, host: true, online: true }, ...guests.values()],
    suggestions,
    wrong: [...wrong],
    check,
    finished: finished(),
    race: null,
  };
}

/** Once every square is filled: solved, wrong, or just full when there are no answers to check. */
function finished(): RoomState['finished'] {
  if (!page || page.puzzle.blocks.some((block, cell) => !block && !grid[cell])) return null;
  const s = solutions();
  return !s ? 'full' : isSolved(s, grid) ? 'solved' : 'wrong';
}

function fillIn(): SidebarStatus['fillIn'] {
  const done = finished();
  if (mode !== 'coop' || !page || (done !== 'solved' && done !== 'full')) return null;
  if (grid.every((letter, cell) => page!.letters[cell] === letter)) return 'done';
  return sitePort() ? 'ready' : 'no-tab';
}

const onlineIds = () => [...guests.values()].filter(p => p.online).map(p => p.id);
const link = () => session && { link: GUEST_URL + '#' + session.roomId, status: session.status };
const replay = () => ({ events: history.events, durationMs: history.events.at(-1)?.at ?? 0 });

/** Pushes the current state everywhere. Called after every change. */
function update() {
  autoAccept();
  suggestions = pruneSuggestions(suggestions, page?.puzzle ?? null, grid);
  const state = roomState();
  const status: SidebarStatus = {
    mode,
    racePhase: race.phase,
    pagePuzzle: pagePuzzle(page),
    otherPuzzle: pagePuzzle(otherPage()),
    fillIn: fillIn(),
    state,
    host,
    session: link(),
    undo: lastAccept && { playerIds: lastAccept.playerIds, clueId: lastAccept.clueId },
    answers: answerStatus(),
  };
  for (const port of sidebars) port.postMessage(status);
  if (fullViews.size) {
    const raceView: RaceViewStatus = {
      host,
      session: link(),
      pagePuzzle: status.pagePuzzle,
      otherPuzzle: status.otherPuzzle,
      answers: status.answers,
      phase: race.phase,
      settings: race.settings,
      puzzle: race.puzzle,
      goAt: race.goAt,
      endedAt: race.endedAt,
      players: [...guests.values()],
      racers: race.details(),
      results: race.results,
    };
    const full: FullViewStatus = { sidebar: status, race: raceView, replay: replay() };
    for (const port of fullViews) port.postMessage(full);
  }
  // Once play has moved here, the crossword's own page says so.
  const notice = mode === 'coop' && !fromSite ? NOTICE : null;
  for (const [port, p] of pages) port.postMessage({ type: 'notice', text: samePuzzle(p) ? notice : null } satisfies ToAdapter);
  if (session) {
    sendToGuests({ t: 'state', state });
    // Racers who have finished know every answer, so they can watch everyone else's grid.
    if (race.running) {
      const details = race.details();
      const boards = details.map(({ id, letters, status }) => ({ id, letters, status }));
      for (const r of details) if (r.finishedAt !== null) sendToGuests({ t: 'race-boards', boards }, r.id);
    }
  }
}

function answerStatus(): SidebarStatus['answers'] {
  if (!page) return null;
  const key = puzzleKey(page.puzzle);
  if (!answers.has(key)) return 'reading';
  const s = answers.get(key);
  return s ? s[0].filter(Boolean).length : 'none';
}

/** Sends to everyone connected (including people still on the join screen), or to one player. */
function sendToGuests(msg: HostMessage, onlyClientId?: string) {
  for (const [conn, clientId] of session?.conns ?? []) {
    if (conn.open && (!onlyClientId || clientId === onlyClientId)) conn.send(msg);
  }
}

/** Puts letters into the shared grid ('' clears), crediting them to `by` in the replay. */
function setLetters(cells: { cell: number; letter: string }[], by: string) {
  if (!page) return;
  const blocks = page.puzzle.blocks;
  const changed = cells.filter(({ cell, letter }) => cell >= 0 && cell < blocks.length && !blocks[cell] && grid[cell] !== letter);
  if (!changed.length) return;
  for (const { cell, letter } of changed) {
    grid[cell] = letter;
    wrong.delete(cell);
  }
  const now = Date.now();
  history.startedAt ??= now;
  history.events.push({ at: now - history.startedAt, board: 'shared', by, cells: changed.map(({ cell, letter }) => [cell, letter]) });
}

/** Starts playing a crossword: the grid as the site shows it, and nothing left over from the last one. */
function usePuzzle(snapshot: PageSnapshot) {
  page = snapshot;
  grid = snapshot.puzzle.blocks.map(() => '');
  fromSite = true;
  suggestions = [];
  lastAccept = null;
  autoAccepted = new Set();
  wrong = new Set();
  check = null;
  hostClueId = null;
  history = { startedAt: null, events: [] };
  // Letters already there open the replay.
  setLetters(snapshot.letters.map((letter, cell) => ({ cell, letter })), HOST_ID);
}

function onPage(snapshot: PageSnapshot) {
  if (page && samePuzzle(snapshot)) {
    page = snapshot;
    if (fromSite) setLetters(snapshot.letters.map((letter, cell) => ({ cell, letter })), HOST_ID);
  } else if (!page || (!session && fromSite && !race.running)) {
    // Before anyone is playing, follow whichever crossword the host opens; after that it's offered to switch to.
    usePuzzle(snapshot);
  }
}

/** Puts a suggestion card (everyone who suggested these letters for this clue) into the grid. */
function acceptGroup(clueId: string, letters: string[]): boolean {
  const group = suggestions.filter(x => x.clueId === clueId && sameLetters(x.letters, letters));
  if (!group.length || !page) return false;
  const changes = cellsToApply(page.puzzle, group[0])
    .map(({ cell, letter }) => ({ cell, before: grid[cell], after: letter }))
    .filter(c => c.before !== c.after);
  lastAccept = changes.length ? { playerIds: group.map(x => x.playerId), clueId, changes } : null;
  fromSite = false;
  setLetters(
    changes.map(c => ({ cell: c.cell, letter: c.after })),
    group.length > 1 ? AGREED_BY : group[0].playerId,
  );
  return true;
}

/** Accepts cards automatically when the host has chosen to: once two or more agree, or always (trusted). */
function autoAccept() {
  if (mode !== 'coop' || acceptMode === 'manual') return;
  const groups = groupSuggestions(suggestions);
  const key = (g: { clueId: string; letters: string[] }) => `${g.clueId}:${g.letters.join(',')}`;
  autoAccepted = new Set([...autoAccepted].filter(k => groups.some(g => key(g) === k)));
  for (const g of groups) {
    // The host suggests when unsure, so their suggestions wait for someone to agree, even with trusted friends.
    const needsTwo = acceptMode === 'agreed' || g.playerIds.includes(HOST_ID);
    if (autoAccepted.has(key(g)) || (needsTwo && g.playerIds.length < 2)) continue;
    if (acceptGroup(g.clueId, g.letters)) autoAccepted.add(key(g));
  }
}

/** Types the grid into the crossword on the site, with its tab brought forward (sites can ignore a hidden tab). */
async function fillSite() {
  const port = sitePort();
  if (!port || !page || fillIn() !== 'ready') return;
  const site = page.letters;
  const cells = grid.map((letter, cell) => ({ cell, letter })).filter(({ cell, letter }) => !page!.puzzle.blocks[cell] && site[cell] !== letter);
  const tab = port.sender?.tab;
  if (tab?.id !== undefined) {
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
  }
  port.postMessage({ type: 'apply', cells } satisfies ToAdapter);
}

function randomRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return 'gc-' + [...bytes].map(b => (b % 36).toString(36)).join('');
}

function startSession() {
  if (session) return;
  const roomId = randomRoomId();
  const s: Session = { roomId, peer: new Peer(roomId), status: 'Connecting…', conns: new Map() };
  session = s;
  const live = () => session === s;

  s.peer.on('open', () => {
    if (!live()) return;
    s.status = 'Live';
    update();
  });
  s.peer.on('disconnected', () => {
    // Lost the signalling server; existing guest connections keep working.
    if (!live() || s.peer.destroyed) return;
    s.status = 'Reconnecting…';
    update();
    setTimeout(() => live() && !s.peer.destroyed && s.peer.reconnect(), 2000);
  });
  s.peer.on('error', err => {
    if (!live()) return;
    s.status = `Problem: ${err.type}`;
    update();
  });
  s.peer.on('connection', conn => {
    if (!live()) return conn.close();
    s.conns.set(conn, null);
    // The room straight away, so the join screen can show who's already here.
    conn.on('open', () => live() && conn.send({ t: 'state', state: roomState() } satisfies HostMessage));
    conn.on('data', data => live() && onGuestMessage(s, conn, data));
    conn.on('close', () => {
      if (!live()) return;
      const clientId = s.conns.get(conn);
      s.conns.delete(conn);
      const player = clientId ? guests.get(clientId) : undefined;
      if (player && ![...s.conns.values()].includes(clientId!)) player.online = false;
      if (race.running && race.allFinished(onlineIds())) race.end(Date.now());
      update();
    });
  });
  update();
}

function stopSession() {
  session?.peer.destroy();
  session = null;
  guests.clear();
  suggestions = [];
  lastAccept = null;
  race.reset();
  update();
}

function onGuestMessage(s: Session, conn: DataConnection, data: unknown) {
  const msg = parseGuestMessage(data);
  if (!msg) return;
  if (msg.t === 'hello') {
    s.conns.set(conn, msg.clientId);
    const previous = guests.get(msg.clientId);
    guests.set(msg.clientId, { id: msg.clientId, name: msg.name, color: msg.color, clueId: previous?.clueId ?? null, host: false, online: true });
    // Joining mid-race: a late joiner starts empty; someone coming back gets their grid back (sent after the state,
    // which carries the puzzle).
    const restore = mode === 'race' ? race.join(msg.clientId) : null;
    update();
    if (restore) sendToGuests({ t: 'race-letters', letters: restore }, msg.clientId);
    return;
  }
  const clientId = s.conns.get(conn);
  const player = clientId ? guests.get(clientId) : undefined;
  if (!player) return;
  if (msg.t === 'get-replay') return conn.send({ t: 'replay', ...replay() } satisfies HostMessage);
  if (mode === 'coop') {
    if (msg.t === 'select') player.clueId = msg.clueId;
    if (msg.t === 'suggest') suggestions = upsertSuggestion(suggestions, { playerId: player.id, clueId: msg.clueId, letters: msg.letters });
  }
  if (mode === 'race' && msg.t === 'race-letters') {
    const now = Date.now();
    const notQuite = race.letters(player.id, msg.letters, now);
    if (notQuite) sendToGuests({ t: 'not-quite', ...notQuite }, player.id);
    if (race.allFinished(onlineIds())) race.end(now);
  }
  update();
}

/** Commands from the sidebar and the full-page host view. */
function onCommand(msg: Command) {
  const now = Date.now();
  switch (msg.type) {
    case 'start':
      return startSession();
    case 'stop':
      return stopSession();
    case 'host':
      host = msg.host;
      browser.storage.local.set({ host });
      return update();
    case 'mode':
      if (race.running) return; // finish or end the race first
      mode = msg.mode;
      race.reset();
      return update();
    case 'accept-mode':
      acceptMode = msg.acceptMode;
      browser.storage.local.set({ acceptMode });
      return update();
    case 'switch-puzzle': {
      const other = otherPage();
      if (!other || race.running) return;
      usePuzzle(other);
      return update();
    }
    case 'accept':
      acceptGroup(msg.clueId, msg.letters);
      return update();
    case 'undo':
      if (!lastAccept) return;
      // Only put back squares that still hold what the accept put in, so later changes aren't lost.
      setLetters(
        lastAccept.changes.filter(c => grid[c.cell] === c.after).map(c => ({ cell: c.cell, letter: c.before })),
        HOST_ID,
      );
      lastAccept = null;
      return update();
    case 'reject': {
      const inGroup = (x: Suggestion) => x.clueId === msg.clueId && sameLetters(x.letters, msg.letters);
      for (const x of suggestions.filter(inGroup)) sendToGuests({ t: 'rejected', clueId: msg.clueId }, x.playerId);
      suggestions = suggestions.filter(x => !inGroup(x));
      return update();
    }
    case 'type':
      if (mode !== 'coop') return;
      fromSite = false;
      setLetters(
        msg.cells.map(c => ({ cell: c.cell, letter: normalizeLetter(c.letter) })),
        HOST_ID,
      );
      return update();
    case 'select':
      hostClueId = msg.clueId;
      return update();
    case 'suggest':
      if (mode !== 'coop' || !page?.puzzle.clues.some(c => c.id === msg.clueId)) return;
      suggestions = upsertSuggestion(suggestions, { playerId: HOST_ID, clueId: msg.clueId, letters: msg.letters.map(normalizeLetter) });
      return update();
    case 'check': {
      const s = solutions();
      if (mode !== 'coop' || !s) return;
      const status = squareStatus(s, grid);
      const found = msg.cells.filter(cell => status[cell] === 'wrong');
      for (const cell of msg.cells) wrong.delete(cell);
      for (const cell of found) wrong.add(cell);
      check = { label: msg.label, wrong: found.length, at: now };
      return update();
    }
    case 'fill-site':
      fillSite();
      return;
    case 'race-settings': {
      if (race.running) return;
      const penaltySeconds = Math.max(0, Math.min(600, Math.round(Number(msg.settings.penaltySeconds) || 0)));
      race.settings = { showOthersProgress: Boolean(msg.settings.showOthersProgress), penaltySeconds };
      return update();
    }
    case 'start-race': {
      // A race uses the crossword being played, and needs its answers and someone to race.
      const s = solutions();
      if (mode !== 'race' || race.running || !session || !page || !s || !onlineIds().length) return;
      race.start(page.puzzle, s, onlineIds(), now);
      return update();
    }
    case 'end-race':
      race.end(now);
      return update();
    case 'new-race':
      if (race.running) return;
      race.reset();
      return update();
  }
}

browser.runtime.onConnect.addListener(port => {
  if (port.name === 'adapter') {
    port.onMessage.addListener(m => {
      const msg = m as FromAdapter;
      if (msg.type === 'answers') answers.set(msg.puzzleKey, msg.solutions);
      if (msg.type === 'page') {
        const { type, ...snapshot } = msg;
        pages.delete(port); // so the most recent report comes last
        pages.set(port, snapshot);
        onPage(snapshot);
      }
      update();
    });
    // The crossword being played stays as it was if its tab goes away (e.g. the host reloads it).
    port.onDisconnect.addListener(() => {
      pages.delete(port);
      update();
    });
  }
  const views = port.name === 'sidebar' ? sidebars : port.name === 'full' ? fullViews : null;
  if (views) {
    views.add(port);
    port.onMessage.addListener(m => onCommand(m as Command));
    port.onDisconnect.addListener(() => views.delete(port));
    update();
  }
});

browser.browserAction.onClicked.addListener(() => browser.sidebarAction.toggle());
