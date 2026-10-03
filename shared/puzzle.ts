import { continuationOf, parseEnumeration, referencesIn, type Break } from './clues';

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
  /** Answers that run across several entries ("See 13"): clue ids in answer order, the one with the clue first. */
  links: string[][];
  /** Clue id -> the clues it refers to (lightly highlighted alongside it). */
  refs: Record<string, string[]>;
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

/**
 * Builds a Puzzle from what a site shows: its block pattern and its clue list. Sites may also mark which clues a clue
 * refers to (`refs`, by number).
 */
export function buildPuzzle(
  title: string,
  rows: number,
  cols: number,
  blocks: boolean[],
  clueTexts: { num: number; dir: Dir; text: string; refs?: number[] }[],
): Puzzle {
  const { numbers, entries } = layoutEntries(rows, cols, blocks);
  const clues: Clue[] = [];
  for (const { num, dir, text } of clueTexts) {
    const entry = entries.find(e => e.num === num && e.dir === dir);
    if (entry) clues.push({ id: clueId(num, dir), num, dir, text, cells: entry.cells });
  }
  // A clue number without a direction usually means the same direction, else the other one.
  const find = (num: number, dir: Dir) => clues.find(c => c.num === num && c.dir === dir) ?? clues.find(c => c.num === num);

  const links: string[][] = [];
  for (const clue of clues) {
    const of = continuationOf(clue.text);
    const head = of && find(of.num, of.dir ?? clue.dir);
    if (!head || head === clue) continue;
    const group = links.find(g => g[0] === head.id);
    if (group) group.push(clue.id);
    else links.push([head.id, clue.id]);
  }

  const refs: Record<string, string[]> = {};
  clueTexts.forEach(({ num, dir, refs: marked = [] }, i) => {
    const clue = clues.find(c => c.num === num && c.dir === dir);
    if (!clue) return;
    const mentioned = [...referencesIn(clueTexts[i].text).map(r => find(r.num, r.dir)), ...marked.map(n => find(n, dir))];
    const ids = [...new Set(mentioned.flatMap(c => (c && c !== clue ? [c.id] : [])))];
    if (ids.length) refs[clue.id] = ids;
  });
  return { title, rows, cols, blocks, numbers, clues, links, refs };
}

/** The entries making up the answer a clue belongs to: just the clue, unless it's part of a linked answer. */
export function answerOf(puzzle: Puzzle, clue: Clue): Clue[] {
  const group = puzzle.links.find(g => g.includes(clue.id));
  return group ? group.map(id => puzzle.clues.find(c => c.id === id)!).filter(Boolean) : [clue];
}

export type CellBreaks = { right?: Break; bottom?: Break };

/**
 * Where to draw word breaks: after each word of a multi-word answer, from its enumeration, e.g. (3,6) or (4-2).
 * Linked answers use the first entry's enumeration across all their entries.
 */
export function wordBreaks(puzzle: Puzzle): Map<number, CellBreaks> {
  const breaks = new Map<number, CellBreaks>();
  for (const clue of puzzle.clues) {
    const parts = answerOf(puzzle, clue);
    if (parts[0] !== clue) continue; // a later part: handled with the first
    const enumeration = parseEnumeration(clue.text);
    const cells = parts.flatMap(p => p.cells.map(cell => ({ cell, dir: p.dir, last: cell === p.cells.at(-1) })));
    if (!enumeration || enumeration.lengths.reduce((a, b) => a + b, 0) !== cells.length) continue;
    let at = 0;
    enumeration.breaks.forEach((kind, i) => {
      at += enumeration.lengths[i];
      const { cell, dir, last } = cells[at - 1];
      if (last) return; // the entry ends here anyway
      const side = dir === 'A' ? 'right' : 'bottom';
      breaks.set(cell, { ...breaks.get(cell), [side]: kind });
    });
  }
  return breaks;
}

/** Identifies a puzzle by its grid and clues (not its title, which sites may change mid-solve). */
export const puzzleKey = (p: Puzzle) => JSON.stringify([p.rows, p.cols, p.blocks, p.clues]);

/** The clue running through a cell in a direction. */
export const clueAt = (puzzle: Puzzle, cell: number, dir: Dir) =>
  puzzle.clues.find(c => c.dir === dir && c.cells.includes(cell));

/** For each square of an answer, the word break after it (for the anagram pad), from its enumeration. */
export function slotBreaks(answer: Clue[]): ('' | Break)[] {
  const total = answer.reduce((n, part) => n + part.cells.length, 0);
  const slots: ('' | Break)[] = Array(total).fill('');
  const enumeration = answer.length ? parseEnumeration(answer[0].text) : null;
  if (!enumeration || enumeration.lengths.reduce((a, b) => a + b, 0) !== total) return slots;
  let at = 0;
  enumeration.breaks.forEach((kind, i) => {
    at += enumeration.lengths[i];
    slots[at - 1] = kind;
  });
  return slots;
}
