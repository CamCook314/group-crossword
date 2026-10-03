// The host's hub: holds the session, talks to the guests over WebRTC, to the crossword page, and to the sidebar.
import { Peer, type DataConnection } from 'peerjs';
import { COLORS, GUEST_URL, parseGuestMessage, type HostMessage, type Player, type RoomState, type Suggestion } from '../../shared/protocol';
import { puzzleKey } from '../../shared/puzzle';
import { cellsToApply, pruneSuggestions, upsertSuggestion } from '../../shared/suggestions';
import type { FromSidebar, HostProfile, PageSnapshot, SidebarStatus, ToAdapter } from './messages';

const HOST_ID = 'host';

interface Session {
  roomId: string;
  peer: Peer;
  status: string;
  /** Open connections -> the guest's clientId (known once they've said hello). */
  conns: Map<DataConnection, string | null>;
}

let host: HostProfile = { name: 'Host', color: COLORS[0] };
let page: PageSnapshot | null = null;
let adapter: browser.runtime.Port | null = null;
const sidebars = new Set<browser.runtime.Port>();
const guests = new Map<string, Player>();
let suggestions: Suggestion[] = [];
let session: Session | null = null;
/** What the last accepted suggestion changed on the site, so it can be undone. */
let lastAccept: { playerId: string; clueId: string; changes: { cell: number; before: string; after: string }[] } | null = null;

browser.storage.local.get('host').then(stored => {
  if (stored.host) host = stored.host as HostProfile;
  update();
});

function roomState(): RoomState {
  return {
    puzzle: page?.puzzle ?? null,
    letters: page?.letters ?? [],
    players: [{ id: HOST_ID, ...host, clueId: page?.clueId ?? null, host: true, online: true }, ...guests.values()],
    suggestions,
  };
}

/** Pushes the current state everywhere. Called after every change. */
function update() {
  suggestions = pruneSuggestions(suggestions, page?.puzzle ?? null, page?.letters ?? []);
  const state = roomState();
  const status: SidebarStatus = {
    state,
    host,
    session: session && { link: GUEST_URL + '#' + session.roomId, status: session.status },
    undo: lastAccept && { playerId: lastAccept.playerId, clueId: lastAccept.clueId },
  };
  for (const port of sidebars) port.postMessage(status);
  adapter?.postMessage({ type: 'overlay', state: session ? state : null } satisfies ToAdapter);
  if (session) sendToGuests({ t: 'state', state });
}

function sendToGuests(msg: HostMessage, onlyClientId?: string) {
  for (const [conn, clientId] of session?.conns ?? []) {
    if (conn.open && clientId && (!onlyClientId || clientId === onlyClientId)) conn.send(msg);
  }
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
  update();
}

function onGuestMessage(s: Session, conn: DataConnection, data: unknown) {
  const msg = parseGuestMessage(data);
  if (!msg) return;
  if (msg.t === 'hello') {
    s.conns.set(conn, msg.clientId);
    const previous = guests.get(msg.clientId);
    guests.set(msg.clientId, { id: msg.clientId, name: msg.name, color: msg.color, clueId: previous?.clueId ?? null, host: false, online: true });
    update();
    return;
  }
  const clientId = s.conns.get(conn);
  const player = clientId ? guests.get(clientId) : undefined;
  if (!player) return;
  if (msg.t === 'select') player.clueId = msg.clueId;
  if (msg.t === 'suggest') suggestions = upsertSuggestion(suggestions, { playerId: player.id, clueId: msg.clueId, letters: msg.letters });
  update();
}

function onSidebarMessage(msg: FromSidebar) {
  switch (msg.type) {
    case 'start':
      return startSession();
    case 'stop':
      return stopSession();
    case 'host':
      host = msg.host;
      browser.storage.local.set({ host });
      return update();
    case 'accept': {
      const s = suggestions.find(x => x.playerId === msg.playerId && x.clueId === msg.clueId);
      if (!s || !page) return;
      const letters = page.letters;
      const changes = cellsToApply(page.puzzle, s)
        .map(({ cell, letter }) => ({ cell, before: letters[cell], after: letter }))
        .filter(c => c.before !== c.after);
      lastAccept = changes.length ? { playerId: s.playerId, clueId: s.clueId, changes } : null;
      // The suggestion disappears by itself once its letters show up on the site.
      adapter?.postMessage({ type: 'apply', cells: changes.map(c => ({ cell: c.cell, letter: c.after })) } satisfies ToAdapter);
      return update();
    }
    case 'undo': {
      if (!lastAccept || !page) return;
      const letters = page.letters;
      // Only put back squares that still hold what the accept typed, so later changes aren't lost.
      const cells = lastAccept.changes.filter(c => letters[c.cell] === c.after).map(c => ({ cell: c.cell, letter: c.before }));
      adapter?.postMessage({ type: 'apply', cells } satisfies ToAdapter);
      lastAccept = null;
      return update();
    }
    case 'reject':
      suggestions = suggestions.filter(x => !(x.playerId === msg.playerId && x.clueId === msg.clueId));
      sendToGuests({ t: 'rejected', clueId: msg.clueId }, msg.playerId);
      return update();
  }
}

browser.runtime.onConnect.addListener(port => {
  if (port.name === 'adapter') {
    port.onMessage.addListener(m => {
      const snapshot = m as PageSnapshot;
      // Whichever crossword page reported most recently is the one we use.
      adapter = port;
      if (page && puzzleKey(page.puzzle) !== puzzleKey(snapshot.puzzle)) {
        suggestions = [];
        lastAccept = null;
      }
      page = snapshot;
      update();
    });
    // Keep the last page state if the tab goes away (e.g. the host reloads), so guests still see the grid.
    port.onDisconnect.addListener(() => {
      if (adapter === port) adapter = null;
    });
  }
  if (port.name === 'sidebar') {
    sidebars.add(port);
    port.onMessage.addListener(m => onSidebarMessage(m as FromSidebar));
    port.onDisconnect.addListener(() => sidebars.delete(port));
    update();
  }
});

browser.browserAction.onClicked.addListener(() => browser.sidebarAction.toggle());
