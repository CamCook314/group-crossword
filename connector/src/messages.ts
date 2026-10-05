// Messages between the connector's content scripts on puzzle pages and its background page.
import type { Solutions } from '../../shared/answers';
import type { PageSnapshot } from '../../shared/connector';

export type FromAdapter =
  | ({ type: 'page' } & PageSnapshot)
  /** The answers for the puzzle with this puzzleKey, or null if they couldn't be read. */
  | { type: 'answers'; puzzleKey: string; solutions: Solutions | null };

export type ToAdapter =
  /** A note to show on the crossword's page, or null for none. */
  | { type: 'notice'; text: string | null }
  /** Letters to put into the site; '' clears a square. */
  | { type: 'apply'; cells: { cell: number; letter: string }[] };
