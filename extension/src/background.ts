// The host's hub: holds the session, talks to the guests over WebRTC, to the crossword page, the sidebar and the
// full-page host view.
import { Peer, type DataConnection } from 'peerjs';
import type { Solutions } from '../../shared/answers';
import {
  COLORS,
  GUEST_URL,
  parseGuestMessage,
  type AcceptMode,
  type HostMessage,
  type Player,
  type RoomState,
  type Suggestion,
} from '../../shared/protocol';
import { puzzleKey } from '../../shared/puzzle';
import type { ReplayEvent } from '../../shared/replay';
import { AGREED_BY, cellsToApply, groupSuggestions, pruneSuggestions, sameLetters, upsertSuggestion } from '../../shared/suggestions';
import { type Command, type FromAdapter, type FullViewStatus, type HostProfile, type Mode, type PageSnapshot, type RaceViewStatus, type SidebarStatus, type ToAdapter } from './messages';
import { RaceHost } from './raceHost';

const HOST_ID = 'host';

interface Session {
  roomId: string;
  peer: Peer;
  status: string;
  /** Open connections -> the guest's clientId (known once they've said hello). */
  conns: Map<DataConnection, string | null>;
}

let host: HostProfile = { name: 'Host', color: COLORS[0] };
let acceptMode: AcceptMode = 'manual';
let page: PageSnapshot | null = null;
/** The answers the page reported, for the puzzle with this key. Kept here only: never part of the room state. */
let answers: { puzzleKey: string; solutions: Solutions | null } | null = null;
let adapter: browser.runtime.Port | null = null;
const sidebars = new Set<browser.runtime.Port>();
const fullViews = new Set<browser.runtime.Port>();
let mode: Mode = 'coop';
const race = new RaceHost(() => update());
const guests = new Map<string, Player>();
let suggestions: Suggestion[] = [];
let session: Session | null = null;
/** What the last accepted suggestion changed on the site, so it can be undone. */
let lastAccept: { playerIds: string[]; clueId: string; changes: { cell: number; before: string; after: string }[] } | null = null;
/** Suggestion cards already put in automatically (clue + letters), so they're never typed twice. */
let autoAccepted = new Set<string>();
/** The co-op solve so far, for the replay: every letter change on the site and who made it. */
let history: { startedAt: number | null; events: ReplayEvent[] } = { startedAt: null, events: [] };
/** Letters on their way into the site, and whose they are, so the replay can credit them. */
const typing = new Map<number, { letter: string; by: string }>();

browser.storage.local.get(['host', 'acceptMode']).then(stored => {
  if (stored.host) host = stored.host as HostProfile;
  if (stored.acceptMode) acceptMode = stored.acceptMode as AcceptMode;
  update();
});

function roomState(): RoomState {
  if (mode === 'race') {
    return {
      mode,
      acceptMode: 'manual',
      puzzle: race.puzzle, // only set once the countdown starts
      letters: [],
      players: [...guests.values()],
      suggestions: [],
      race: race.stateForRacers(Date.now()),
    };
  }
  return {
    mode,
    acceptMode,
    puzzle: page?.puzzle ?? null,
    letters: page?.letters ?? [],
    players: [{ id: HOST_ID, ...host, clueId: page?.clueId ?? null, host: true, online: true }, ...guests.values()],
    suggestions,
    race: null,
  };
}

const onlineIds = () => [...guests.values()].filter(p => p.online).map(p => p.id);
const link = () => session && { link: GUEST_URL + '#' + session.roomId, status: session.status };
const replay = () => ({ events: history.events, durationMs: history.events.at(-1)?.at ?? 0 });

/** Pushes the current state everywhere. Called after every change. */
function update() {
  suggestions = pruneSuggestions(suggestions, page?.puzzle ?? null, page?.letters ?? []);
  autoAccept();
  const state = roomState();
  const pagePuzzle = page && { title: page.puzzle.title, rows: page.puzzle.rows, cols: page.puzzle.cols };
  const status: SidebarStatus = {
    mode,
    racePhase: race.phase,
    pagePuzzle,
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
      pagePuzzle,
      answers: answerStatus(),
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
  // The overlay on the real crossword is for co-op only (word breaks show even before a session starts).
  adapter?.postMessage({ type: 'overlay', state: mode === 'coop' ? state : null } satisfies ToAdapter);
  if (session) sendToGuests({ t: 'state', state });
}

function answerStatus(): SidebarStatus['answers'] {
  if (!page) return null;
  if (answers?.puzzleKey !== puzzleKey(page.puzzle)) return 'reading';
  return answers.solutions ? answers.solutions[0].filter(Boolean).length : 'none';
}

function sendToGuests(msg: HostMessage, onlyClientId?: string) {
  for (const [conn, clientId] of session?.conns ?? []) {
    if (conn.open && clientId && (!onlyClientId || clientId === onlyClientId)) conn.send(msg);
  }
}

/** Types letters into the real crossword ('' clears), crediting them to `by` in the replay. */
function applyLetters(cells: { cell: number; letter: string }[], by: string) {
  if (!adapter || !cells.length) return;
  for (const { cell, letter } of cells) typing.set(cell, { letter, by });
  adapter.postMessage({ type: 'apply', cells } satisfies ToAdapter);
}

/** Puts a suggestion card (everyone who suggested these letters for this clue) onto the crossword. */
function acceptGroup(clueId: string, letters: string[]): boolean {
  const group = suggestions.filter(x => x.clueId === clueId && sameLetters(x.letters, letters));
  if (!group.length || !page || !adapter) return false;
  const current = page.letters;
  const changes = cellsToApply(page.puzzle, group[0])
    .map(({ cell, letter }) => ({ cell, before: current[cell], after: letter }))
    .filter(c => c.before !== c.after);
  lastAccept = changes.length ? { playerIds: group.map(x => x.playerId), clueId, changes } : null;
  // The suggestions disappear by themselves once their letters show up on the site.
  applyLetters(
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
    if (autoAccepted.has(key(g)) || (acceptMode === 'agreed' && g.playerIds.length < 2)) continue;
    if (acceptGroup(g.clueId, g.letters)) autoAccepted.add(key(g));
  }
}

/** Records the letters that changed on the site for the co-op replay, crediting whoever they were typed for. */
function recordChanges(before: string[], after: string[]) {
  const now = Date.now();
  const byWho = new Map<string, [number, string][]>();
  after.forEach((letter, cell) => {
    if (letter === before[cell]) return;
    const pending = typing.get(cell);
    const by = pending && pending.letter === letter ? pending.by : HOST_ID;
    typing.delete(cell);
    byWho.set(by, [...(byWho.get(by) ?? []), [cell, letter]]);
  });
  if (!byWho.size) return;
  history.startedAt ??= now;
  for (const [by, cells] of byWho) history.events.push({ at: now - history.startedAt, board: 'shared', by, cells });
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
    case 'accept':
      acceptGroup(msg.clueId, msg.letters);
      return update();
    case 'undo': {
      if (!lastAccept || !page) return;
      const letters = page.letters;
      // Only put back squares that still hold what the accept typed, so later changes aren't lost.
      applyLetters(
        lastAccept.changes.filter(c => letters[c.cell] === c.after).map(c => ({ cell: c.cell, letter: c.before })),
        HOST_ID,
      );
      lastAccept = null;
      return update();
    }
    case 'reject': {
      const inGroup = (x: Suggestion) => x.clueId === msg.clueId && sameLetters(x.letters, msg.letters);
      for (const x of suggestions.filter(inGroup)) sendToGuests({ t: 'rejected', clueId: msg.clueId }, x.playerId);
      suggestions = suggestions.filter(x => !inGroup(x));
      return update();
    }
    case 'type':
      // The host typing on the full-page view: straight onto the crossword.
      if (mode === 'coop' && page) applyLetters(msg.cells.filter(c => c.cell >= 0 && c.cell < page!.letters.length), HOST_ID);
      return;
    case 'race-settings': {
      if (race.running) return;
      const penaltySeconds = Math.max(0, Math.min(600, Math.round(Number(msg.settings.penaltySeconds) || 0)));
      race.settings = { showOthersProgress: Boolean(msg.settings.showOthersProgress), penaltySeconds };
      return update();
    }
    case 'start-race': {
      // A race uses the crossword open on the site, and needs its answers and someone to race.
      const solutions = page && answers?.puzzleKey === puzzleKey(page.puzzle) ? answers.solutions : null;
      if (mode !== 'race' || race.running || !session || !page || !solutions || !onlineIds().length) return;
      race.start(page.puzzle, solutions, onlineIds(), now);
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
      // Whichever crossword page reported most recently is the one we use.
      adapter = port;
      if (msg.type === 'answers') answers = { puzzleKey: msg.puzzleKey, solutions: msg.solutions };
      if (msg.type === 'page') {
        const { type, ...snapshot } = msg;
        if (page && puzzleKey(page.puzzle) === puzzleKey(snapshot.puzzle)) recordChanges(page.letters, snapshot.letters);
        else {
          if (page) {
            // A different puzzle: start afresh.
            suggestions = [];
            lastAccept = null;
            history = { startedAt: null, events: [] };
            typing.clear();
          }
          // Letters already on the grid open the replay.
          recordChanges(snapshot.letters.map(() => ''), snapshot.letters);
        }
        page = snapshot;
      }
      update();
    });
    // Keep the last page state if the tab goes away (e.g. the host reloads), so guests still see the grid.
    port.onDisconnect.addListener(() => {
      if (adapter === port) adapter = null;
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
