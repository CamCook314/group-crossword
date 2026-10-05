// A sudoku's structure as players see it. Never contains the solution.

export interface Sudoku {
  kind: 'sudoku';
  title: string;
  author?: string;
  rows: number;
  cols: number;
  /** All false: every square is played. Shared shape with crosswords (shared/puzzle.ts), whose black squares are true. */
  blocks: boolean[];
  /** The region (box) each square belongs to, row by row; regions are numbered 0.. in order of first appearance. */
  regions: number[];
  /** Given digits, row by row ('' where empty). */
  givens: string[];
  /** The symbols that go in the squares, in order, e.g. '123456789' or '123456'. */
  digits: string;
  /** Sudoku X: both main diagonals also hold each digit once. */
  diagonals: boolean;
  /** The rules as players see them. */
  rules: string;
}

/** Regions for a grid of boxes `boxWidth` squares wide and `boxHeight` tall. */
export function regionsFromBoxes(rows: number, cols: number, boxWidth: number, boxHeight: number): number[] {
  const across = cols / boxWidth;
  return Array.from({ length: rows * cols }, (_, cell) => {
    const row = Math.floor(cell / cols);
    const col = cell % cols;
    return Math.floor(row / boxHeight) * across + Math.floor(col / boxWidth);
  });
}

/** Every set of squares that must hold each digit once: rows, columns, regions, and for Sudoku X the diagonals. */
export function units(s: Sudoku): number[][] {
  const { rows, cols } = s;
  const range = (n: number) => [...Array(n).keys()];
  const regions: number[][] = [];
  s.regions.forEach((region, cell) => (regions[region] ??= []).push(cell));
  const all = [
    ...range(rows).map(r => range(cols).map(c => r * cols + c)),
    ...range(cols).map(c => range(rows).map(r => r * cols + c)),
    ...regions,
  ];
  if (s.diagonals) all.push(range(rows).map(r => r * cols + r), range(rows).map(r => r * cols + cols - 1 - r));
  return all;
}

/** Identifies a sudoku by its title, size and givens. */
export const sudokuKey = (s: Sudoku) => JSON.stringify([s.title, s.rows, s.cols, s.givens]);
