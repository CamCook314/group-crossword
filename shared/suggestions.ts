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
export function clashes(puzzle: Puzzle, letters: string[], s: Pick<Suggestion, 'clueId' | 'letters'>): boolean[] {
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

/** Colour for a letter that two or more players suggested. */
export const AGREED_COLOR = '#8a8a8a';

/**
 * Suggested letters to draw in each cell's corners. A letter two or more players suggested is shown once, in grey,
 * first (most-agreed first); the rest follow one per player, in the order the suggestions were made (so a new
 * suggestion never moves the existing ones).
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
    // letter -> the players who suggested it, in the order they did
    const byLetter = new Map<string, string[]>();
    for (const [id, letter] of byPlayer) byLetter.set(letter, [...(byLetter.get(letter) ?? []), id]);
    const groups = [...byLetter];
    const agreed = groups.filter(([, ids]) => ids.length > 1).sort((a, b) => b[1].length - a[1].length);
    const list = [
      ...agreed.map(([letter]) => ({ text: letter, color: AGREED_COLOR })),
      ...groups.filter(([, ids]) => ids.length === 1).map(([letter, [id]]) => ({ text: letter, color: players.find(p => p.id === id)?.color ?? '#888888' })),
    ];
    marks.set(cell, list.length > MAX_CORNERS ? [...list.slice(0, MAX_CORNERS - 1), { text: `+${list.length - (MAX_CORNERS - 1)}`, color: '#888888' }] : list);
  }
  return marks;
}

export interface SuggestionGroup {
  clueId: string;
  letters: string[];
  /** Everyone who made this exact suggestion, in the order they did. */
  playerIds: string[];
}

export const sameLetters = (a: string[], b: string[]) => a.length === b.length && a.every((l, i) => l === b[i]);

/** Identical suggestions (same clue, same letters) combined; the most-agreed first, otherwise in the order they were made. */
export function groupSuggestions(list: Suggestion[]): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  for (const s of list) {
    const group = groups.find(g => g.clueId === s.clueId && sameLetters(g.letters, s.letters));
    if (group) group.playerIds.push(s.playerId);
    else groups.push({ clueId: s.clueId, letters: s.letters, playerIds: [s.playerId] });
  }
  return groups.sort((a, b) => b.playerIds.length - a.playerIds.length); // sort is stable
}
