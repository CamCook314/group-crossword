import { describe, expect, it } from 'vitest';
import { boardAt, contributorsAt, type ReplayEvent } from './replay';

// A 3x3 grid (9 squares), written as a string: '.' = empty.
const grid = (s: string) => [...s].map(c => (c === '.' ? '' : c));

describe('a race replay', () => {
  const events: ReplayEvent[] = [
    { at: 500, board: 'ann', by: 'ann', cells: [[0, 'C']] },
    { at: 1000, board: 'bob', by: 'bob', cells: [[0, 'X']] },
    { at: 2000, board: 'ann', by: 'ann', cells: [[1, 'A'], [2, 'X']] },
    { at: 3000, board: 'ann', by: 'ann', cells: [[2, '']] },
    { at: 4000, board: 'ann', by: 'ann', cells: [[2, 'T']] },
  ];

  it('starts empty', () => {
    expect(boardAt(events, 'ann', 9, 0)).toEqual(grid('.........'));
  });

  it('applies events up to and including t, and none after', () => {
    expect(boardAt(events, 'ann', 9, 1999)).toEqual(grid('C........'));
    expect(boardAt(events, 'ann', 9, 2000)).toEqual(grid('CAX......'));
  });

  it('only applies events for the board asked for', () => {
    expect(boardAt(events, 'bob', 9, 5000)).toEqual(grid('X........'));
    expect(boardAt(events, 'nobody', 9, 5000)).toEqual(grid('.........'));
  });

  it('clears squares, and fills them again', () => {
    expect(boardAt(events, 'ann', 9, 3000)).toEqual(grid('CA.......'));
    expect(boardAt(events, 'ann', 9, 5000)).toEqual(grid('CAT......'));
  });
});

describe('a co-op replay', () => {
  const events: ReplayEvent[] = [
    { at: 500, board: 'shared', by: 'ann', cells: [[0, 'C']] },
    { at: 900, board: 'shared', by: 'bob', cells: [[1, 'A'], [0, 'K']] },
    { at: 1500, board: 'shared', by: 'host', cells: [[1, ''], [2, 'T']] },
  ];

  it('knows who put each square’s current letter there', () => {
    expect(contributorsAt(events, 'shared', 9, 600)).toEqual(['ann', '', '', '', '', '', '', '', '']);
    expect(contributorsAt(events, 'shared', 9, 900)).toEqual(['bob', 'bob', '', '', '', '', '', '', '']);
  });

  it('forgets the contributor of a cleared square', () => {
    expect(boardAt(events, 'shared', 9, 2000)).toEqual(grid('K.T......'));
    expect(contributorsAt(events, 'shared', 9, 2000)).toEqual(['bob', '', 'host', '', '', '', '', '', '']);
  });
});
