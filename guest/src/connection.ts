import { Peer, type DataConnection } from 'peerjs';
import type { GuestMessage, HostMessage } from '../../shared/protocol';

export interface Connection {
  send(msg: GuestMessage): void;
  close(): void;
}

/**
 * Connects to the host's room. The host sends the room straight away (so the join screen can show who's there);
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
  peer.on('open', () => {
    const c = peer.connect(roomId, { reliable: true });
    conn = c;
    c.on('open', () => {
      const h = hello();
      if (h) c.send(h);
      onProblem(null);
    });
    c.on('data', data => onMessage(data as HostMessage));
    c.on('close', () => onProblem('Disconnected from the host.'));
  });
  peer.on('error', err =>
    onProblem(err.type === 'peer-unavailable' ? "Can't find that session. Is the host still running it?" : `Connection problem (${err.type}).`),
  );
  return {
    send: msg => {
      if (conn?.open) conn.send(msg);
    },
    close: () => peer.destroy(),
  };
}
