import { Peer, type DataConnection } from 'peerjs';
import type { GuestMessage, HostMessage } from '../../shared/protocol';

export interface Connection {
  send(msg: GuestMessage): void;
  close(): void;
}

/** Tries before giving up: about two minutes, long enough for the host to reload. */
const MAX_TRIES = 60;

/**
 * Connects to the host's room, and reconnects by itself if the connection drops (e.g. the host's tab reloads). The host sends the room straight away (so the join screen can show who's there);
 * `hello()` gives the hello to send, once you've joined, whenever the connection opens.
 * onProblem gets a message while connecting or when something goes wrong, and null once connected.
 */
export function connect(
  roomId: string,
  hello: () => GuestMessage | null,
  onMessage: (msg: HostMessage) => void,
  onProblem: (problem: string | null) => void,
): Connection {
  const peer = new Peer();
  let conn: DataConnection | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** Failed tries in a row. */
  let failures = 0;

  const attach = () => {
    const c = peer.connect(roomId, { reliable: true });
    conn = c;
    c.on('open', () => {
      failures = 0;
      const h = hello();
      if (h) c.send(h);
      onProblem(null);
    });
    c.on('data', data => onMessage(data as HostMessage));
    c.on('close', () => tryAgain('Reconnecting…'));
  };
  const tryAgain = (problem: string) => {
    if (closed) return;
    clearTimeout(retry);
    if (++failures > MAX_TRIES) return onProblem("Can't find that session. Is the host still running it?");
    onProblem(problem);
    retry = setTimeout(attach, 2000);
  };

  peer.on('open', attach);
  // Lost the signalling server: get it back, so reconnecting can work.
  peer.on('disconnected', () => setTimeout(() => !closed && !peer.destroyed && peer.reconnect(), 2000));
  peer.on('error', err => {
    if (err.type === 'peer-unavailable') tryAgain(failures < 3 ? 'Connecting…' : 'Waiting for the host…');
    else onProblem(`Connection problem (${err.type}).`);
  });
  return {
    send: msg => {
      if (conn?.open) conn.send(msg);
    },
    close: () => {
      closed = true;
      clearTimeout(retry);
      peer.destroy();
    },
  };
}
