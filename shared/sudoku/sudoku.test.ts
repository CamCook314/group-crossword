import { describe, expect, it } from 'vitest';
import { clashes, followsRules } from './check';
import { regionsFromBoxes, sudokuKey, units, type Sudoku } from './model';
import { puzzleMeSudoku } from './puzzleme';
import { solve } from './solve';

// All grids here are made up.

/** Row strings to row-by-row squares ('.' = empty). */
const squares = (rows: string[]) => rows.flatMap(row => [...row].map(ch => (ch === '.' ? '' : ch)));

/** A square sudoku from a picture of its givens, one string per row. */
const sudoku = (givens: string[], boxWidth: number, boxHeight: number, diagonals = false): Sudoku => {
  const n = givens.length;
  return {
    kind: 'sudoku',
    title: 'Test',
    rows: n,
    cols: n,
    blocks: Array(n * n).fill(false),
    regions: regionsFromBoxes(n, n, boxWidth, boxHeight),
    givens: squares(givens),
    digits: '123456789'.slice(0, n),
    diagonals,
    rules: '',
  };
};

// 4×4 Sudoku X, unique only with the diagonals.
const xSolution = ['1234', '3412', '4321', '2143'];
const xGivens = ['....', '3..2', '....', '.1..'];

// 6×6 with boxes 2 wide and 3 tall.
const sixSolution = ['463521', '214635', '352146', '635214', '521463', '146352'];
const sixGivens = ['4.....', '....35', '...1..', '635...', '....6.', '.....2'];

// 9×9 with a minimal set of givens: without any one of them, it has several solutions.
const nineSolution = [
  '721365489',
  '536498271',
  '849217356',
  '218673945',
  '367954128',
  '495182637',
  '953841762',
  '672539814',
  '184726593',
];
const nineGivens = [
  '7.....4..',
  '..6..8...',
  '...21....',
  '.18.739.5',
  '..7......',
  '4.....6..',
  '.5.....6.',
  '...53....',
  '1..726..3',
];

describe('sudoku model', () => {
  it('numbers boxes row by row', () => {
    expect(regionsFromBoxes(6, 6, 2, 3)).toEqual(squares(['001122', '001122', '001122', '334455', '334455', '334455']).map(Number));
    expect(regionsFromBoxes(6, 6, 3, 2)).toEqual(squares(['000111', '000111', '222333', '222333', '444555', '444555']).map(Number));
  });

  it('lists rows, columns, boxes and, for Sudoku X, the diagonals', () => {
    const plain = units(sudoku(xGivens, 2, 2));
    expect(plain).toHaveLength(12);
    expect(plain).toContainEqual([1, 5, 9, 13]);
    expect(plain).toContainEqual([10, 11, 14, 15]);
    const x = units(sudoku(xGivens, 2, 2, true));
    expect(x).toHaveLength(14);
    expect(x.slice(12)).toEqual([
      [0, 5, 10, 15],
      [3, 6, 9, 12],
    ]);
  });

  it('identifies a sudoku by its title, size and givens', () => {
    const s = sudoku(xGivens, 2, 2);
    expect(sudokuKey({ ...s, rules: 'other' })).toBe(sudokuKey(s));
    expect(sudokuKey({ ...s, title: 'Other' })).not.toBe(sudokuKey(s));
    expect(sudokuKey(sudoku(['1...', ...xGivens.slice(1)], 2, 2))).not.toBe(sudokuKey(s));
  });
});

describe('clashes', () => {
  it('marks every square whose digit repeats in a row, column or box', () => {
    const values = squares(xSolution);
    values[5] = '1'; // a second 1 in row 1, column 1 and the first box
    expect(clashes(sudoku(xGivens, 2, 2), values)).toEqual(new Set([0, 5, 6, 13]));
  });

  it('ignores empty squares, and checks the diagonals only for Sudoku X', () => {
    const values = squares(['1...', '....', '....', '...1']);
    expect(clashes(sudoku(xGivens, 2, 2), values).size).toBe(0);
    expect(clashes(sudoku(xGivens, 2, 2, true), values)).toEqual(new Set([0, 15]));
  });

  it('accepts only full grids of the right digits without clashes', () => {
    const x = sudoku(xGivens, 2, 2, true);
    expect(followsRules(x, squares(xSolution))).toBe(true);
    expect(followsRules(x, squares(['1234', '3412', '4321', '214.']))).toBe(false);
    expect(followsRules(x, squares(['1234', '3412', '4321', '2140']))).toBe(false);
    expect(followsRules(x, squares(['1234', '3412', '4321']))).toBe(false);
    // Valid without the diagonals, not with them.
    const classic = squares(['1234', '3412', '2143', '4321']);
    expect(followsRules({ ...x, diagonals: false }, classic)).toBe(true);
    expect(followsRules(x, classic)).toBe(false);
  });
});

describe('solver', () => {
  it('finds the only solution', () => {
    expect(solve(sudoku(nineGivens, 3, 3))).toEqual(squares(nineSolution));
    expect(solve(sudoku(sixGivens, 2, 3))).toEqual(squares(sixSolution));
    expect(solve(sudoku(xGivens, 2, 2, true))).toEqual(squares(xSolution));
  });

  it('gives null when there are several solutions', () => {
    expect(solve(sudoku(['7........', ...nineGivens.slice(1)], 3, 3))).toBeNull();
    expect(solve(sudoku(Array(9).fill('.........'), 3, 3))).toBeNull();
    expect(solve(sudoku(xGivens, 2, 2))).toBeNull(); // Sudoku X without the diagonals
  });

  it('gives null when there are none', () => {
    expect(solve(sudoku(['1..1', '....', '....', '....'], 2, 2))).toBeNull();
    // No clashing givens, but nothing fits the top right square.
    expect(solve(sudoku(['123.', '...4', '....', '....'], 2, 2))).toBeNull();
  });
});

/** PuzzleMe stores grids column by column: `box[col][row]`. */
const columns = <T>(rows: T[][]) => rows[0].map((_, col) => rows.map(row => row[col]));

/** Shaped like PuzzleMe's decoded data for a 6×6 sudoku (some fields left out). */
const sample = {
  alphabets: ['1', '2', '3', '4', '5', '6'],
  subgridHeight: 3,
  subgridWidth: 2,
  isSudokuX: false,
  isPicdoku: false,
  title: 'Test sudoku',
  author: 'A. Setter',
  help: 'Fill the grid so that each column, each row, and each of the six 2x3 sub-grids contain all of the digits.',
  puzzleType: 'SUDOKU',
  w: 6,
  h: 6,
  box: columns(sixSolution.map(row => [...row])),
  preRevealIdxs: columns(sixGivens.map(row => [...row].map(ch => ch !== '.'))),
};

describe('PuzzleMe sudokus', () => {
  it('reads the column-major grids row by row, with boxes from the subgrid size', () => {
    expect(puzzleMeSudoku(sample)).toEqual({
      sudoku: {
        kind: 'sudoku',
        title: 'Test sudoku',
        author: 'A. Setter',
        rows: 6,
        cols: 6,
        blocks: Array(36).fill(false),
        regions: regionsFromBoxes(6, 6, 2, 3),
        givens: squares(sixGivens),
        digits: '123456',
        diagonals: false,
        rules: 'Fill the grid so that every row, column and box contains each of the digits 1 to 6 once.',
      },
      solution: squares(sixSolution),
    });
  });

  it('reads Sudoku X and other symbols', () => {
    const x = puzzleMeSudoku({ ...sample, isSudokuX: true })!.sudoku;
    expect(x.diagonals).toBe(true);
    expect(x.rules).toMatch(/1 to 6 once\. So does each of the two main diagonals\.$/);
    const letters = puzzleMeSudoku({
      ...sample,
      alphabets: [...'ABCDEF'],
      box: sample.box.map(col => col.map(digit => 'ABCDEF'[+digit - 1])),
    })!;
    expect(letters.sudoku.digits).toBe('ABCDEF');
    expect(letters.sudoku.rules).toMatch(/each of A, B, C, D, E and F once\.$/);
    expect(letters.solution.slice(0, 6).join('')).toBe('DFCEBA');
  });

  it('rejects variants and anything else', () => {
    expect(puzzleMeSudoku({ ...sample, secondaryPuzzleType: 'PICDOKU', isPicdoku: true })).toBeNull();
    expect(puzzleMeSudoku({ ...sample, secondaryPuzzleType: 'KILLER_SUDOKU', preRevealIdxs: undefined })).toBeNull();
    expect(puzzleMeSudoku({ ...sample, puzzleType: 'CROSSWORD' })).toBeNull();
    expect(puzzleMeSudoku({ ...sample, box: sample.box.map(col => col.map(() => '')) })).toBeNull();
    expect(puzzleMeSudoku({})).toBeNull();
    expect(puzzleMeSudoku(null)).toBeNull();
  });
});
