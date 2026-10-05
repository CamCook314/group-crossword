// Pure helpers for the sudoku solving view (SudokuSolver.tsx): squares, selection, pencil marks and region lines.
import type { Puzzle } from '../puzzle';
import type { Sudoku } from './model';

/** A square's id in suggestions and players' selections: 's' + its index. */
export const squareId = (cell: number) => `s${cell}`;

/** "r3c5", as sudoku solvers name squares. */
export const squareLabel = (s: Sudoku, cell: number) => `r${Math.floor(cell / s.cols) + 1}c${(cell % s.cols) + 1}`;

/**
 * The sudoku in the crossword's shape, each square a one-square clue keyed as sudoku suggestions are, so the
 * crossword's suggestion marks and replay work on it.
 */
export function asPuzzle(s: Sudoku): Puzzle {
  return {
    title: s.title,
    rows: s.rows,
    cols: s.cols,
    blocks: s.blocks,
    numbers: s.blocks.map(() => null),
    clues: s.blocks.map((_, cell) => ({ id: squareId(cell), num: cell, dir: 'A', text: '', cells: [cell] })),
    links: [],
    refs: {},
  };
}

/** Do two squares share a row, column or region? */
export const sees = (s: Sudoku, a: number, b: number) =>
  Math.floor(a / s.cols) === Math.floor(b / s.cols) || a % s.cols === b % s.cols || s.regions[a] === s.regions[b];

/** The square one step from `cell`, wrapping round at the edges as SudokuPad does. */
export function step(s: Sudoku, cell: number, dr: number, dc: number): number {
  const row = (Math.floor(cell / s.cols) + dr + s.rows) % s.rows;
  const col = ((cell % s.cols) + dc + s.cols) % s.cols;
  return row * s.cols + col;
}

/** The selection with `cell` added as its main square, which is always the last. */
export const withMain = (selected: number[], cell: number) => [...selected.filter(c => c !== cell), cell];

/** A record by square, without the given squares. */
export const without = <T>(record: Record<number, T>, cells: number[]): Record<number, T> =>
  Object.fromEntries(Object.entries(record).filter(([cell]) => !cells.includes(+cell)));

/** The digit a key types, or ''. 0–9 go by the key's position, so they still count with Shift or Ctrl held. */
export function keyDigit(e: { key: string; code: string }, digits: string): string {
  const key = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1] ?? (e.key.length === 1 ? e.key.toUpperCase() : '');
  return key && digits.includes(key) ? key : '';
}

/**
 * Toggles a digit in the squares' pencil marks (square -> its digits, in the puzzle's order), as SudokuPad does: it's
 * taken out if every square has it, else added to them all.
 */
export function toggleMarks(marks: Record<number, string>, cells: number[], digit: string, digits: string): Record<number, string> {
  const remove = cells.every(cell => marks[cell]?.includes(digit));
  const next = { ...marks };
  for (const cell of cells) {
    const have = next[cell] ?? '';
    const now = remove ? have.replace(digit, '') : [...digits].filter(d => d === digit || have.includes(d)).join('');
    if (now) next[cell] = now;
    else delete next[cell];
  }
  return next;
}

export interface Mark {
  digit: string;
  /** Unset for your own marks, which are drawn in the text colour. */
  color?: string;
}

/** One square's marks of one kind from several players: each digit once, in the puzzle's order, in the colour of the first layer that has it. */
export const mergeMarks = (digits: string, layers: { marks?: string; color?: string }[]): Mark[] =>
  [...digits].flatMap(digit => {
    const layer = layers.find(l => l.marks?.includes(digit));
    return layer ? [{ digit, color: layer.color }] : [];
  });

/** Where corner marks go, in order: the corners (top left, top right, bottom left, bottom right), then the edges (top, bottom, left, right). */
export const CORNER_PLACES = 8;

/** Corner marks by place (see CORNER_PLACES); any beyond the last place share it. */
export const cornerPlaces = <T>(marks: T[]): T[][] =>
  Array.from({ length: CORNER_PLACES }, (_, i) => (i < CORNER_PLACES - 1 ? marks.slice(i, i + 1) : marks.slice(i)));

/** The thick lines between regions, as SVG path data in units of one square. */
export function regionLines(s: Sudoku): string {
  let path = '';
  s.regions.forEach((region, cell) => {
    const row = Math.floor(cell / s.cols);
    const col = cell % s.cols;
    if (col + 1 < s.cols && s.regions[cell + 1] !== region) path += `M${col + 1} ${row}v1`;
    if (row + 1 < s.rows && s.regions[cell + s.cols] !== region) path += `M${col} ${row + 1}h1`;
  });
  return path;
}
