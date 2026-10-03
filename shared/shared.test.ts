import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, textOn } from './color';
import { COLORS, parseGuestMessage, type Player, type Suggestion } from './protocol';
import { buildPuzzle, clueAt, layoutEntries } from './puzzle';
import { cellsToApply, clashes, cornerMarks, pruneSuggestions, upsertSuggestion } from './suggestions';

// 3x3 ring:   1 . 2
//             . # .
//             3 . .
const blocks = [false, false, false, false, true, false, false, false, false];
const puzzle = buildPuzzle('Ring', 3, 3, blocks, [
  { num: 1, dir: 'A', text: 'Top (3)' },
  { num: 3, dir: 'A', text: 'Bottom (3)' },
  { num: 1, dir: 'D', text: 'Left (3)' },
  { num: 2, dir: 'D', text: 'Right (3)' },
  { num: 9, dir: 'A', text: 'Not in this grid' },
]);

const player = (id: string, color = '#000000'): Player => ({ id, name: id, color, clueId: null, host: false, online: true });

describe('puzzle layout', () => {
  it('numbers cells and finds entries like a printed crossword', () => {
    const { numbers, entries } = layoutEntries(3, 3, blocks);
    expect(numbers).toEqual([1, null, 2, null, null, null, 3, null, null]);
    expect(entries).toEqual([
      { num: 1, dir: 'A', cells: [0, 1, 2] },
      { num: 1, dir: 'D', cells: [0, 3, 6] },
      { num: 2, dir: 'D', cells: [2, 5, 8] },
      { num: 3, dir: 'A', cells: [6, 7, 8] },
    ]);
  });

  it('keeps the site clue order and drops clues with no matching entry', () => {
    expect(puzzle.clues.map(c => c.id)).toEqual(['1A', '3A', '1D', '2D']);
    expect(puzzle.clues[3].cells).toEqual([2, 5, 8]);
  });

  it('finds the clue through a cell', () => {
    expect(clueAt(puzzle, 8, 'A')?.id).toBe('3A');
    expect(clueAt(puzzle, 8, 'D')?.id).toBe('2D');
    expect(clueAt(puzzle, 1, 'D')).toBeUndefined();
  });

  it('treats a grid without blocks normally', () => {
    const { entries } = layoutEntries(2, 2, [false, false, false, false]);
    expect(entries.map(e => `${e.num}${e.dir}`)).toEqual(['1A', '1D', '2D', '3A']);
  });
});

describe('suggestions', () => {
  const s = (playerId: string, clueId: string, letters: string[]): Suggestion => ({ playerId, clueId, letters });

  it('replaces a player\'s earlier suggestion for the same clue, and withdraws on all-blank', () => {
    let list = upsertSuggestion([], s('a', '1A', ['C', 'A', 'T']));
    list = upsertSuggestion(list, s('b', '1A', ['D', 'O', 'G']));
    list = upsertSuggestion(list, s('a', '1A', ['C', 'O', 'W']));
    expect(list).toEqual([s('b', '1A', ['D', 'O', 'G']), s('a', '1A', ['C', 'O', 'W'])]);
    expect(upsertSuggestion(list, s('a', '1A', ['', '', '']))).toEqual([s('b', '1A', ['D', 'O', 'G'])]);
  });

  it('prunes suggestions already in the grid or for unknown clues', () => {
    const letters = ['C', 'A', 'T', '', '', '', '', '', ''];
    const list = [s('a', '1A', ['C', 'A', 'T']), s('b', '1A', ['C', '', 'R']), s('c', '1A', ['C', '', '']), s('d', '7D', ['X'])];
    expect(pruneSuggestions(list, puzzle, letters)).toEqual([s('b', '1A', ['C', '', 'R'])]);
    expect(pruneSuggestions(list, null, letters)).toBe(list);
  });

  it('types only the filled-in letters when accepted', () => {
    expect(cellsToApply(puzzle, s('a', '2D', ['T', '', 'E']))).toEqual([{ cell: 2, letter: 'T' }, { cell: 8, letter: 'E' }]);
  });

  it('flags letters that would replace a different letter', () => {
    const letters = ['C', 'A', 'T', '', '', '', '', '', ''];
    expect(clashes(puzzle, letters, s('a', '1A', ['C', 'O', '']))).toEqual([false, true, false]);
  });

  it('puts one corner letter per player, in the order the suggestions were made', () => {
    const players = [player('a', '#aaaaaa'), player('b', '#bbbbbb')];
    const marks = cornerMarks(puzzle, [s('b', '1A', ['X', '', '']), s('a', '1D', ['Y', '', ''])], players);
    expect(marks.get(0)).toEqual([{ text: 'X', color: '#bbbbbb' }, { text: 'Y', color: '#aaaaaa' }]);
    expect(marks.has(1)).toBe(false);

    // A player's newer letter for the same cell keeps their place.
    const again = cornerMarks(puzzle, [s('b', '1A', ['X', '', '']), s('a', '1D', ['Y', '', '']), s('b', '1D', ['Z', '', ''])], players);
    expect(again.get(0)!.map(m => m.text)).toEqual(['Z', 'Y']);
  });

  it('shows four corner letters, then +N', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(id => player(id));
    const four = cornerMarks(puzzle, ['a', 'b', 'c', 'd'].map(id => s(id, '1A', ['Q', '', ''])), players);
    expect(four.get(0)!.map(m => m.text)).toEqual(['Q', 'Q', 'Q', 'Q']);
    const five = cornerMarks(puzzle, ['a', 'b', 'c', 'd', 'e'].map(id => s(id, '1A', ['Q', '', ''])), players);
    expect(five.get(0)!.map(m => m.text)).toEqual(['Q', 'Q', 'Q', '+2']);
  });
});

describe('colours', () => {
  it('converts between HSV and hex', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 1, v: 0.5 })).toBe('#000080');
    expect(hsvToHex({ h: 77, s: 0, v: 1 })).toBe('#ffffff');
    for (const c of COLORS) expect(hsvToHex(hexToHsv(c))).toBe(c);
  });

  it('picks readable text for a background', () => {
    expect(textOn('#ffff00')).toBe('#000000');
    expect(textOn('#1f77b4')).toBe('#ffffff');
  });
});

describe('guest message validation', () => {
  it('accepts well-formed messages and cleans them up', () => {
    expect(parseGuestMessage({ t: 'hello', clientId: 'abcdef123456', name: '  Sam ', color: '#1f77b4' })).toEqual({
      t: 'hello', clientId: 'abcdef123456', name: 'Sam', color: '#1f77b4',
    });
    expect(parseGuestMessage({ t: 'suggest', clueId: '6A', letters: ['a', '', '?', 'B'] })).toEqual({
      t: 'suggest', clueId: '6A', letters: ['A', '', '', 'B'],
    });
    expect(parseGuestMessage({ t: 'select', clueId: null })).toEqual({ t: 'select', clueId: null });
  });

  it('rejects malformed messages', () => {
    for (const bad of [null, 'hi', { t: 'nope' }, { t: 'select', clueId: '6X' }, { t: 'suggest', clueId: '6A', letters: 'ABC' },
      { t: 'hello', clientId: 'x', name: 'Sam', color: '#1f77b4' }, { t: 'hello', clientId: 'abcdef123456', name: 'Sam', color: 'red' }]) {
      expect(parseGuestMessage(bad)).toBeNull();
    }
  });
});
