// A small solver for classic sudokus (rows, columns, regions, and the diagonals for Sudoku X), for puzzles that come
// without a solution. Backtracking over candidate bitmasks, filling the square with the fewest candidates first.
import { units, type Sudoku } from './model';

const countBits = (mask: number) => {
  let n = 0;
  for (; mask; mask &= mask - 1) n++;
  return n;
};

/** The puzzle's solution, row by row, or null if it has none or more than one. */
export function solve(s: Sudoku): string[] | null {
  const size = s.rows * s.cols;
  const all = (1 << s.digits.length) - 1;
  const unitList = units(s);
  const unitsOf: number[][] = Array.from({ length: size }, () => []);
  unitList.forEach((unit, u) => unit.forEach(cell => unitsOf[cell].push(u)));
  /** For each unit, the digits placed in it, as bits. */
  const used = unitList.map(() => 0);
  /** Each square's digit, as an index into `digits`; -1 where empty. */
  const grid: number[] = Array(size).fill(-1);

  const candidates = (cell: number) => unitsOf[cell].reduce((mask, u) => mask & ~used[u], all);
  const place = (cell: number, d: number) => {
    grid[cell] = d;
    for (const u of unitsOf[cell]) used[u] |= 1 << d;
  };
  const unplace = (cell: number, d: number) => {
    grid[cell] = -1;
    for (const u of unitsOf[cell]) used[u] &= ~(1 << d);
  };

  for (let cell = 0; cell < size; cell++) {
    if (!s.givens[cell]) continue;
    const d = s.digits.indexOf(s.givens[cell]);
    if (d < 0 || !(candidates(cell) & (1 << d))) return null;
    place(cell, d);
  }

  let found = 0;
  let solution: number[] = [];
  const search = () => {
    let best = -1;
    let bestMask = 0;
    let bestCount = Infinity;
    for (let cell = 0; cell < size && bestCount > 1; cell++) {
      if (grid[cell] >= 0) continue;
      const mask = candidates(cell);
      const count = countBits(mask);
      if (count < bestCount) [best, bestMask, bestCount] = [cell, mask, count];
    }
    if (best < 0) {
      if (++found === 1) solution = [...grid];
      return;
    }
    for (let d = 0; d < s.digits.length && found < 2; d++) {
      if (!(bestMask & (1 << d))) continue;
      place(best, d);
      search();
      unplace(best, d);
    }
  };
  search();
  return found === 1 ? solution.map(d => s.digits[d]) : null;
}
