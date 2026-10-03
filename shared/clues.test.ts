import { describe, expect, it } from 'vitest';
import { continuationOf, parseEnumeration, referencesIn } from './clues';
import { answerOf, buildPuzzle, slotBreaks, wordBreaks } from './puzzle';

describe('reading clue texts', () => {
  it('reads word lengths and breaks from the enumeration', () => {
    expect(parseEnumeration('Dude laughs following "Up" opening scene (8)')).toEqual({ lengths: [8], breaks: [] });
    expect(parseEnumeration('Shifty demon hunter (2,3,4)')).toEqual({ lengths: [2, 3, 4], breaks: ['word', 'word'] });
    expect(parseEnumeration('You need these to get through (1-4)')).toEqual({ lengths: [1, 4], breaks: ['hyphen'] });
    expect(parseEnumeration('Mixed (3,4-2) ')).toEqual({ lengths: [3, 4, 2], breaks: ['word', 'hyphen'] });
    expect(parseEnumeration('Nuts and bolts')).toBeNull();
    expect(parseEnumeration('Contains (a note) inside')).toBeNull();
  });

  it('recognises an entry that continues another clue', () => {
    expect(continuationOf('See 13')).toEqual({ num: 13, dir: undefined });
    expect(continuationOf('See 4 Down')).toEqual({ num: 4, dir: 'D' });
    expect(continuationOf('see 21-across.')).toEqual({ num: 21, dir: 'A' });
    expect(continuationOf('See the light (3)')).toBeNull();
  });

  it('finds the clues a clue refers to', () => {
    expect(referencesIn('Away from a 4-Down')).toEqual([{ num: 4, dir: 'D' }]);
    expect(referencesIn('With 17 Across, a famous pair')).toEqual([{ num: 17, dir: 'A' }]);
    expect(referencesIn('Four score (5)')).toEqual([]);
  });
});

// 5x5 with a block in the middle row:
//   1 2 . 3 .        row 0: 1A = cells 0-1 (2 letters)... see layout below
const open = Array(25).fill(false);
//  # marks blocks:   . . # . .
//                    . . # . .
//                    . . . . .
//                    . . # . .
//                    . . # . .
for (const cell of [2, 7, 17, 22]) open[cell] = true;
const blocks = open;

describe('linked answers, references and word breaks', () => {
  const puzzle = buildPuzzle('Test', 5, 5, blocks, [
    { num: 1, dir: 'A', text: 'First half of a pair (2,2)' }, // 1A: cells 0,1 ; continues in 3A
    { num: 3, dir: 'A', text: 'See 1' }, // 3A: cells 3,4
    { num: 5, dir: 'A', text: 'Middle row (5)', refs: [1] }, // marked by the site as referring to 1
    { num: 1, dir: 'D', text: 'Down the left, like a 2-Down (2-3)' },
    { num: 2, dir: 'D', text: 'Second column (5)' },
  ]);

  it('links entries into one answer, the clue first', () => {
    expect(puzzle.links).toEqual([['1A', '3A']]);
    expect(answerOf(puzzle, puzzle.clues.find(c => c.id === '3A')!).map(c => c.id)).toEqual(['1A', '3A']);
    expect(answerOf(puzzle, puzzle.clues.find(c => c.id === '2D')!).map(c => c.id)).toEqual(['2D']);
  });

  it('collects references from the text and from the site', () => {
    expect(puzzle.refs).toEqual({ '1D': ['2D'], '5A': ['1A'] });
  });

  it('places word breaks, across linked entries too', () => {
    const breaks = wordBreaks(puzzle);
    // 1A+3A is (2,2): the break falls where 1A ends, so nothing to draw.
    expect(breaks.get(1)).toBeUndefined();
    // 1D (cells 0,5,10,15,20) is (2-3): a hyphen under its second square.
    expect(breaks.get(5)).toEqual({ bottom: 'hyphen' });
    expect([...breaks.keys()]).toEqual([5]);
  });

  it('lists the break after each square of an answer, for the anagram pad', () => {
    const oneD = puzzle.clues.find(c => c.id === '1D')!;
    expect(slotBreaks([oneD])).toEqual(['', 'hyphen', '', '', '']);
    expect(slotBreaks(answerOf(puzzle, puzzle.clues.find(c => c.id === '1A')!))).toEqual(['', 'word', '', '']);
  });

  it('ignores an enumeration that does not fit the entry', () => {
    const odd = buildPuzzle('Odd', 5, 5, blocks, [{ num: 2, dir: 'D', text: 'Wrong (2,2)' }]);
    expect(wordBreaks(odd).size).toBe(0);
  });
});
