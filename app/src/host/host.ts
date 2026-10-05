// Hosting from this tab: the engine, the session with the guests, and the connector to the puzzle pages, wired
// together. The game is saved in the tab after every change, so a reload carries on with the same room.
import { COLORS, type AcceptMode } from '../../../shared/protocol';
import { connectToConnector } from './connector';
import { HostEngine, type SavedEngine } from './engine';
import { HostSession, randomRoomId } from './session';
import type { Command, HostProfile, HostScreens } from './types';

const SAVE_KEY = 'hosting';

function load<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function store(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** The room's address for guests: this page, with the room id. */
export const roomLink = (roomId: string) => `${location.origin}${location.pathname}#${roomId}`;

/**
 * Starts hosting. `onScreens` gets what the host's screens show after every change, and `onConnector` the
 * connector's version once it answers. Returns how the screens give commands.
 */
export function startHosting(onScreens: (screens: HostScreens) => void, onConnector: (version: number) => void) {
  let session: HostSession | null = null;
  const engine = new HostEngine(
    {
      toGuests: (msg, clientId) => session?.send(msg, clientId),
      toConnector: msg => toConnector(msg),
      changed: () => {
        onScreens(engine.screens());
        store(sessionStorage, SAVE_KEY, { roomId: session?.roomId ?? null, engine: engine.save() });
      },
    },
    {
      host: load<HostProfile>(localStorage, 'host') ?? { name: 'Host', color: COLORS[0] },
      acceptMode: load<AcceptMode>(localStorage, 'acceptMode') ?? 'manual',
    },
  );
  const toConnector = connectToConnector(msg => {
    if (msg.type === 'hello') onConnector(msg.version);
    if (msg.type === 'page') engine.pageReport(msg.pageId, msg.snapshot);
    if (msg.type === 'page-closed') engine.pageClosed(msg.pageId);
    if (msg.type === 'answers') engine.pageAnswers(msg.puzzleKey, msg.solutions);
  });

  function startSession(roomId: string) {
    session = new HostSession(roomId, engine, status => {
      engine.session = { link: roomLink(roomId), status };
      engine.update();
    });
    engine.session = { link: roomLink(roomId), status: 'Connecting…' };
  }

  const saved = load<{ roomId: string | null; engine: SavedEngine }>(sessionStorage, SAVE_KEY);
  if (saved) {
    engine.restore(saved.engine, Date.now());
    if (saved.roomId) startSession(saved.roomId);
  }
  engine.update();

  // Closing the tab ends the session (a reload carries on), so check first.
  addEventListener('beforeunload', e => session && e.preventDefault());

  return (cmd: Command) => {
    switch (cmd.type) {
      case 'start':
        if (!session) startSession(randomRoomId());
        return engine.update();
      case 'stop':
        session?.stop();
        session = null;
        return engine.sessionStopped();
      case 'host':
        store(localStorage, 'host', cmd.host);
        break;
      case 'accept-mode':
        store(localStorage, 'acceptMode', cmd.acceptMode);
        break;
    }
    engine.command(cmd);
  };
}
