export type Dir = 'A' | 'D';

export interface Clue {
  /** e.g. "6A" */
  id: string;
  num: number;
  dir: Dir;
  text: string;
  /** Row-major cell indices, in answer order. */
  cells: number[];
}

/** A puzzle's structure as read off the site. Never contains the solution. */
export interface Puzzle {
  title: string;
  rows: number;
  cols: number;
  /** Row-major; true = black square. */
  blocks: boolean[];
  /** Clue number printed in each cell, if any. */
  numbers: (number | null)[];
  clues: Clue[];
}

export const clueId = (num: number, dir: Dir) => `${num}${dir}`;

/** Lays out the entries of a blocked grid using standard crossword numbering. */
export function layoutEntries(rows: number, cols: number, blocks: boolean[]) {
  const open = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols && !blocks[r * cols + c];
  const run = (r: number, c: number, dr: number, dc: number) => {
    const cells: number[] = [];
    for (; open(r, c); r += dr, c += dc) cells.push(r * cols + c);
    return cells;
  };
  const numbers: (number | null)[] = blocks.map(() => null);
  const entries: { num: number; dir: Dir; cells: number[] }[] = [];
  let num = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!open(r, c)) continue;
      const across = !open(r, c - 1) && open(r, c + 1);
      const down = !open(r - 1, c) && open(r + 1, c);
      if (!across && !down) continue;
      numbers[r * cols + c] = ++num;
      if (across) entries.push({ num, dir: 'A', cells: run(r, c, 0, 1) });
      if (down) entries.push({ num, dir: 'D', cells: run(r, c, 1, 0) });
    }
  }
  return { numbers, entries };
}

/** Builds a Puzzle from what a site shows: its block pattern and its clue list. */
export function buildPuzzle(
  title: string,
  rows: number,
  cols: number,
  blocks: boolean[],
  clueTexts: { num: number; dir: Dir; text: string }[],
): Puzzle {
  const { numbers, entries } = layoutEntries(rows, cols, blocks);
  const clues: Clue[] = [];
  for (const { num, dir, text } of clueTexts) {
    const entry = entries.find(e => e.num === num && e.dir === dir);
    if (entry) clues.push({ id: clueId(num, dir), num, dir, text, cells: entry.cells });
  }
  return { title, rows, cols, blocks, numbers, clues };
}

/** Identifies a puzzle by its grid and clues (not its title, which sites may change mid-solve). */
export const puzzleKey = (p: Puzzle) => JSON.stringify([p.rows, p.cols, p.blocks, p.clues]);

/** The clue running through a cell in a direction. */
export const clueAt = (puzzle: Puzzle, cell: number, dir: Dir) =>
  puzzle.clues.find(c => c.dir === dir && c.cells.includes(cell));
