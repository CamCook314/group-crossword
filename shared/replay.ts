// Replays: the changes to each board over a race or co-op solve, for watching it back (shared/Replay.tsx).

export interface ReplayEvent {
  /** ms since the start of the race or solve */
  at: number;
  /** which board it changes: a racer's id in a race, 'shared' for the one co-op board */
  board: string;
  /** who made the change: a player id, or 'host' */
  by: string;
  /** the squares that changed: [cell index, letter] ('' = cleared) */
  cells: [number, string][];
}

/** Each square's letter and who put it there, after a board's events up to and including time t. */
function replay(events: ReplayEvent[], board: string, cellCount: number, t: number) {
  const letters: string[] = Array(cellCount).fill('');
  const by: string[] = Array(cellCount).fill('');
  for (const e of events) {
    if (e.at > t) break;
    if (e.board !== board) continue;
    for (const [cell, letter] of e.cells) {
      letters[cell] = letter;
      by[cell] = letter ? e.by : '';
    }
  }
  return { letters, by };
}

/** The letters on a board at time t ('' = empty). Events must be in time order. */
export const boardAt = (events: ReplayEvent[], board: string, cellCount: number, t: number) => replay(events, board, cellCount, t).letters;

/** Who put each square's current letter there, at time t ('' = empty). Events must be in time order. */
export const contributorsAt = (events: ReplayEvent[], board: string, cellCount: number, t: number) => replay(events, board, cellCount, t).by;
