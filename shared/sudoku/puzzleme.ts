// Reading a sudoku from PuzzleMe's decoded data (`rawc`, see shared/rawc.ts). The solution is always in it.
import { regionsFromBoxes, type Sudoku } from './model';

interface PuzzleMeData {
  puzzleType?: string;
  /** Set for variants: 'KILLER_SUDOKU' (with `cages`), 'PICDOKU' (pictures instead of digits). Sudoku X has none. */
  secondaryPuzzleType?: string;
  title?: string;
  author?: string;
  w?: number;
  h?: number;
  /** The solution, `box[col][row]`. */
  box?: string[][];
  /** Which squares are given, `preRevealIdxs[col][row]`. Killer sudokus have none. */
  preRevealIdxs?: boolean[][];
  /** Box size in squares. */
  subgridWidth?: number;
  subgridHeight?: number;
  isSudokuX?: boolean;
  /** The digits, e.g. ['1', … '9'], or the letters of a Wordoku. */
  alphabets?: string[];
}

/**
 * A classic sudoku (optionally Sudoku X) and its solution, row by row, or null for anything else, including killer
 * and picture sudokus. Regions are the boxes from `subgridWidth` / `subgridHeight`: irregular regions, which would
 * come from the walls in `cellInfos`, aren't supported yet.
 */
export function puzzleMeSudoku(data: unknown): { sudoku: Sudoku; solution: string[] } | null {
  const d = (data ?? {}) as PuzzleMeData;
  const { w, h, box, preRevealIdxs = [], subgridWidth, subgridHeight, alphabets } = d;
  if (d.puzzleType !== 'SUDOKU' || d.secondaryPuzzleType) return null;
  if (!w || !h || !subgridWidth || !subgridHeight || !Array.isArray(box) || !Array.isArray(alphabets)) return null;
  const solution: string[] = [];
  const givens: string[] = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const digit = box[col]?.[row];
      if (typeof digit !== 'string' || !alphabets.includes(digit)) return null;
      solution.push(digit);
      givens.push(preRevealIdxs[col]?.[row] ? digit : '');
    }
  }
  const digits = alphabets.join('');
  const diagonals = !!d.isSudokuX;
  const sudoku: Sudoku = {
    kind: 'sudoku',
    title: d.title ?? '',
    author: d.author || undefined,
    rows: h,
    cols: w,
    blocks: solution.map(() => false),
    regions: regionsFromBoxes(h, w, subgridWidth, subgridHeight),
    givens,
    digits,
    diagonals,
    rules: classicRules(digits, diagonals),
  };
  return { sudoku, solution };
}

function classicRules(digits: string, diagonals: boolean) {
  const symbols =
    digits === '123456789'.slice(0, digits.length)
      ? `the digits 1 to ${digits.length}`
      : `${[...digits].slice(0, -1).join(', ')} and ${digits.at(-1)}`;
  const rules = `Fill the grid so that every row, column and box contains each of ${symbols} once.`;
  return diagonals ? `${rules} So does each of the two main diagonals.` : rules;
}
