// Messages between the parts of the extension (content script, background page, sidebar).
import type { RoomState } from '../../shared/protocol';
import type { Puzzle } from '../../shared/puzzle';

/** What a crossword page currently shows. Sent by the content script whenever it changes. */
export interface PageSnapshot {
  puzzle: Puzzle;
  letters: string[];
  /** The clue the host has selected on the site. */
  clueId: string | null;
}

export type ToAdapter =
  | { type: 'overlay'; state: RoomState | null }
  /** Letters to put into the site; '' clears a square. */
  | { type: 'apply'; cells: { cell: number; letter: string }[] };

export interface HostProfile {
  name: string;
  color: string;
}

export interface SidebarStatus {
  state: RoomState;
  host: HostProfile;
  session: { link: string; status: string } | null;
  /** The last accepted suggestion, while it can still be undone. */
  undo: { playerId: string; clueId: string } | null;
}

export type FromSidebar =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'accept' | 'reject'; playerId: string; clueId: string }
  | { type: 'undo' }
  | { type: 'host'; host: HostProfile };
