import { describe, expect, it } from 'vitest';
import { crosshareSolutions, puzzleMeSolutions, solutionsFit } from './answers';
import { buildPuzzle } from './puzzle';
import { decodeRawc, reverseChunks } from './rawc';

// 3x3 ring:  C A T
//            O # O
//            W E T
const blocks = [false, false, false, false, true, false, false, false, false];
const puzzle = buildPuzzle('Ring', 3, 3, blocks, []);
const solution = ['C', 'A', 'T', 'O', '', 'O', 'W', 'E', 'T'];

/** A made-up PuzzleMe puzzle, padded to a realistic size so the key search has enough text to work with. */
const sample = {
  title: 'Test',
  w: 3,
  h: 3,
  box: [
    ['C', 'O', 'W'],
    ['A', '\u0000', 'E'],
    ['T', 'O', 'T'],
  ],
  placedWords: Array.from({ length: 40 }, (_, i) => ({ clue: { clue: `A clue with some words in it, number ${i}` }, originalTerm: 'CAT' })),
};
const base64 = btoa(JSON.stringify(sample));

describe('PuzzleMe rawc', () => {
  it('decodes scrambled data whatever the key', () => {
    for (const key of [
      [5, 9, 3, 14, 7, 2, 11],
      [20, 2, 2, 19, 8, 13, 4],
      [3, 17, 6, 6, 10, 2, 15],
    ]) {
      expect(decodeRawc(reverseChunks(base64, key))).toEqual(sample);
    }
  });

  it('decodes unscrambled data, and gives up on garbage within the time limit', () => {
    expect(decodeRawc(base64)).toEqual(sample);
    for (const garbage of ['not puzzle data at all', btoa('z'.repeat(6000)).split('').reverse().join('')]) {
      const start = Date.now();
      expect(decodeRawc(garbage)).toBeNull();
      expect(Date.now() - start).toBeLessThan(2500);
    }
  });

  it('turns the column-major box into a row-major solution', () => {
    expect(puzzleMeSolutions(sample)).toEqual([solution]);
    const withoutAnswers = { ...sample, box: [['', '', ''], ['', '\u0000', ''], ['', '', '']] };
    expect(puzzleMeSolutions(withoutAnswers)![0].filter(Boolean)).toEqual([]);
    expect(solutionsFit(puzzle, puzzleMeSolutions(withoutAnswers)!)).toBe(false);
    expect(puzzleMeSolutions({})).toBeNull();
  });
});

describe('Crosshare answers', () => {
  it('reads the grid and applies alternate solutions', () => {
    const grid = ['c', 'a', 't', 'o', '.', 'o', 'w', 'e', 't'];
    expect(crosshareSolutions({ grid, alternateSolutions: [[[2, 'b']]] })).toEqual([solution, ['C', 'A', 'B', 'O', '', 'O', 'W', 'E', 'T']]);
  });
});

describe('checking answers belong to the puzzle', () => {
  it('needs the same size and black squares, with every white square filled', () => {
    expect(solutionsFit(puzzle, [solution])).toBe(true);
    expect(solutionsFit(puzzle, [solution.slice(1)])).toBe(false);
    expect(solutionsFit(puzzle, [['C', 'A', 'T', 'O', 'X', 'O', 'W', 'E', 'T']])).toBe(false);
    expect(solutionsFit(puzzle, [])).toBe(false);
  });
});
