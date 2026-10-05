// The host's end of the connections: a PeerJS peer with the room's id, which guests connect to over WebRTC. After the
// host's tab reloads it takes the same id back, retrying while the broker still holds the old one.
import { Peer, type DataConnection } from 'peerjs';
import { parseGuestMessage, type HostMessage } from '../../../shared/protocol';
import type { HostEngine } from './engine';

export function randomRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return 'gc-' + [...bytes].map(b => (b % 36).toString(36)).join('');
}

export class HostSession {
  private peer: Peer | null = null;
  /** Open connections -> the guest's client id (known once they've said hello). */
  private conns = new Map<DataConnection, string | null>();
  private stopped = false;

  constructor(
    readonly roomId: string,
    private engine: HostEngine,
    private onStatus: (status: string) => void,
  ) {
    this.open(1);
  }

  private open(attempt: number) {
    const peer = new Peer(this.roomId);
    this.peer = peer;
    peer.on('open', () => this.onStatus('Live'));
    peer.on('disconnected', () => {
      // Lost the signalling server; existing guest connections keep working.
      if (this.stopped || peer.destroyed) return;
      this.onStatus('Reconnecting…');
      setTimeout(() => !this.stopped && !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', err => {
      if (this.stopped) return;
      // Just after a reload, the broker can still hold our id for a moment.
      if (err.type === 'unavailable-id' && attempt < 30) {
        peer.destroy();
        setTimeout(() => !this.stopped && this.open(attempt + 1), 1000);
        return;
      }
      this.onStatus(`Problem: ${err.type}`);
    });
    peer.on('connection', conn => {
      this.conns.set(conn, null);
      // The room straight away, so the join screen can show who's already here.
      conn.on('open', () => conn.send({ t: 'state', state: this.engine.roomState() } satisfies HostMessage));
      conn.on('data', data => this.onData(conn, data));
      conn.on('close', () => {
        const clientId = this.conns.get(conn);
        this.conns.delete(conn);
        if (!this.stopped && clientId && ![...this.conns.values()].includes(clientId)) this.engine.guestLeft(clientId);
      });
    });
  }

  private onData(conn: DataConnection, data: unknown) {
    const msg = parseGuestMessage(data);
    if (!msg) return;
    if (msg.t === 'hello') {
      this.conns.set(conn, msg.clientId);
      return this.engine.guestHello(msg.clientId, msg.name, msg.color);
    }
    const clientId = this.conns.get(conn);
    if (clientId) this.engine.guestMessage(clientId, msg);
  }

  /** To everyone connected (including people still on the join screen), or to one player. */
  send(msg: HostMessage, clientId?: string) {
    for (const [conn, id] of this.conns) {
      if (conn.open && (!clientId || id === clientId)) conn.send(msg);
    }
  }

  stop() {
    this.stopped = true;
    this.peer?.destroy();
  }
}
