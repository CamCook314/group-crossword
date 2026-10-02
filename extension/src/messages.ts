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
  | { type: 'apply'; cells: { cell: number; letter: string }[] };

export interface HostProfile {
  name: string;
  color: string;
}

export interface SidebarStatus {
  state: RoomState;
  host: HostProfile;
  session: { link: string; status: string } | null;
}

export type FromSidebar =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'accept' | 'reject'; playerId: string; clueId: string }
  | { type: 'host'; host: HostProfile };
