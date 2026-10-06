// Messages between the app (in host mode) and the connector extension, which reads puzzles from the sites the host
// has open and fills them in. They pass through the connector's bridge script on the app's page (window.postMessage),
// because Firefox doesn't let a web page message an extension directly.
import type { Solutions } from './answers';
import type { AnyPuzzle } from './puzzle';

/** Raised when these messages change, so the app can tell the host to update the extension. */
export const CONNECTOR_VERSION = 1;

/** Tags telling the two directions apart on the page's message channel. */
export const FROM_APP = 'group-crossword-app';
export const TO_APP = 'group-crossword-connector';

/** What a crossword page currently shows. Sent by the content script whenever it changes. */
export interface PageSnapshot {
  puzzle: AnyPuzzle;
  letters: string[];
  /** The clue the host has selected on the site. */
  clueId: string | null;
}

export type ToApp =
  | { type: 'hello'; version: number }
  /** A puzzle page, whenever it changes. `pageId` identifies its tab (and frame). */
  | { type: 'page'; pageId: string; snapshot: PageSnapshot }
  | { type: 'page-closed'; pageId: string }
  /** The answers for the puzzle with this key, or null if they couldn't be read. Never sent on to guests. */
  | { type: 'answers'; puzzleKey: string; solutions: Solutions | null };

export type FromApp =
  /** Asks for the connector's version and every puzzle page open. */
  | { type: 'hello' }
  /** A note to show on a puzzle page, or null for none. */
  | { type: 'notice'; pageId: string; text: string | null }
  /** Brings the page's tab forward and types these letters in ('' clears a square). */
  | { type: 'fill'; pageId: string; cells: { cell: number; letter: string }[] };
