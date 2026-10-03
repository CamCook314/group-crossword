import type { Player, Suggestion } from './protocol';
import type { Puzzle } from './puzzle';

/** Adds or replaces a player's suggestion for a clue. An all-blank suggestion just withdraws it. */
export function upsertSuggestion(list: Suggestion[], s: Suggestion): Suggestion[] {
  const rest = list.filter(x => !(x.playerId === s.playerId && x.clueId === s.clueId));
  return s.letters.some(Boolean) ? [...rest, s] : rest;
}

/** Drops suggestions for clues that don't exist, and ones whose letters are all already in the grid. */
export function pruneSuggestions(list: Suggestion[], puzzle: Puzzle | null, letters: string[]): Suggestion[] {
  if (!puzzle) return list;
  return list.filter(s => {
    const clue = puzzle.clues.find(c => c.id === s.clueId);
    if (!clue || clue.cells.length !== s.letters.length) return false;
    return s.letters.some((l, i) => l && letters[clue.cells[i]] !== l);
  });
}

/** The letters to type into the site when a suggestion is accepted (blanks are skipped). */
export function cellsToApply(puzzle: Puzzle, s: Suggestion): { cell: number; letter: string }[] {
  const clue = puzzle.clues.find(c => c.id === s.clueId);
  if (!clue) return [];
  return clue.cells.map((cell, i) => ({ cell, letter: s.letters[i] })).filter(x => x.letter);
}

/** For each letter of a suggestion: would it replace a different letter already in the grid? */
export function clashes(puzzle: Puzzle, letters: string[], s: Suggestion): boolean[] {
  const clue = puzzle.clues.find(c => c.id === s.clueId);
  return s.letters.map((l, i) => {
    const existing = clue ? letters[clue.cells[i]] : '';
    return Boolean(l && existing && existing !== l);
  });
}

/** Corners are filled top-right, top-left, bottom-left, bottom-right. */
export const MAX_CORNERS = 4;

export interface CornerMark {
  /** A letter, or "+N" when more players suggested this cell than there are corners. */
  text: string;
  color: string;
}

/**
 * Suggested letters to draw in each cell's corners: one per player, in the order the suggestions were made
 * (so a new suggestion never moves the existing ones).
 */
export function cornerMarks(puzzle: Puzzle, suggestions: Suggestion[], players: Player[]): Map<number, CornerMark[]> {
  // cell -> playerId -> letter. Map keeps insertion order; a player's later letter replaces theirs in place.
  const byCell = new Map<number, Map<string, string>>();
  for (const s of suggestions) {
    const clue = puzzle.clues.find(c => c.id === s.clueId);
    clue?.cells.forEach((cell, i) => {
      if (!s.letters[i]) return;
      if (!byCell.has(cell)) byCell.set(cell, new Map());
      byCell.get(cell)!.set(s.playerId, s.letters[i]);
    });
  }
  const marks = new Map<number, CornerMark[]>();
  for (const [cell, byPlayer] of byCell) {
    const list = [...byPlayer].map(([id, letter]) => ({ text: letter, color: players.find(p => p.id === id)?.color ?? '#888888' }));
    marks.set(cell, list.length > MAX_CORNERS ? [...list.slice(0, MAX_CORNERS - 1), { text: `+${list.length - (MAX_CORNERS - 1)}`, color: '#888888' }] : list);
  }
  return marks;
}
