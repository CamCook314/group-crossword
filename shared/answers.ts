// Reading a puzzle's answers from what the sites embed in their pages. Answers stay in the host's extension:
// they are never put in the room state that goes to guests.
import { isSudoku, type AnyPuzzle } from './puzzle';

/** A puzzle's accepted solutions, each row-major with one string per cell ('' for blocks). The first is the main one. */
export type Solutions = string[][];

/** From Crosshare's page JSON: `grid` ('.' = block) plus `alternateSolutions`, each a list of [cell, letter] changes. */
export function crosshareSolutions(puzzle: { grid: string[]; alternateSolutions?: [number, string][][] }): Solutions {
  const main = puzzle.grid.map(c => (c === '.' ? '' : c.toUpperCase()));
  const alternates = (puzzle.alternateSolutions ?? []).map(changes => {
    const grid = [...main];
    for (const [cell, letter] of changes) grid[cell] = letter.toUpperCase();
    return grid;
  });
  return [main, ...alternates];
}

/** From PuzzleMe's decoded data: `box[col][row]`, "\u0000" = block, "" = answer not provided. */
export function puzzleMeSolutions(data: unknown): Solutions | null {
  const { w, h, box } = (data ?? {}) as { w?: number; h?: number; box?: string[][] };
  if (!w || !h || !Array.isArray(box)) return null;
  const grid: string[] = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cell = box[col]?.[row];
      if (typeof cell !== 'string') return null;
      grid.push(cell === '\u0000' ? '' : cell.toUpperCase());
    }
  }
  return [grid];
}

/**
 * Do these solutions belong to this puzzle (same size and black squares, and a sudoku's givens), with a single letter
 * or digit in every white square? Racers type one per square, so puzzles with several in a square can't be raced.
 */
export function solutionsFit(puzzle: AnyPuzzle, solutions: Solutions): boolean {
  const fits = (letter: string, cell: number) =>
    puzzle.blocks[cell] ? letter === '' : /^[A-Z0-9]$/.test(letter) && (!isSudoku(puzzle) || !puzzle.givens[cell] || puzzle.givens[cell] === letter);
  return solutions.length > 0 && solutions.every(s => s.length === puzzle.blocks.length && s.every(fits));
}
