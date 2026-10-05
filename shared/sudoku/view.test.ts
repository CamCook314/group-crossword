import { describe, expect, it } from 'vitest';
import { cornerMarks } from '../suggestions';
import { regionsFromBoxes, type Sudoku } from './model';
import { asPuzzle, cornerPlaces, keyDigit, mergeMarks, regionLines, sees, squareLabel, step, toggleMarks, withMain, without } from './view';

/** An empty square sudoku with boxes `boxWidth` × `boxHeight`. */
const sudoku = (n: number, boxWidth: number, boxHeight: number): Sudoku => ({
  kind: 'sudoku',
  title: 'Test',
  rows: n,
  cols: n,
  blocks: Array(n * n).fill(false),
  regions: regionsFromBoxes(n, n, boxWidth, boxHeight),
  givens: Array(n * n).fill(''),
  digits: '123456789'.slice(0, n),
  diagonals: false,
  rules: '',
});

const four = sudoku(4, 2, 2);

describe('squares', () => {
  it('names squares by row and column', () => {
    expect(squareLabel(four, 0)).toBe('r1c1');
    expect(squareLabel(four, 6)).toBe('r2c3');
  });

  it('sees its row, column and region', () => {
    expect([...Array(16).keys()].filter(cell => sees(four, 5, cell))).toEqual([0, 1, 4, 5, 6, 7, 9, 13]);
  });

  it('steps round the edges', () => {
    expect(step(four, 5, 0, 1)).toBe(6);
    expect(step(four, 3, 0, 1)).toBe(0);
    expect(step(four, 0, -1, 0)).toBe(12);
    expect(step(four, 12, 1, 0)).toBe(0);
  });

  it('adds a square to the selection as its main one', () => {
    expect(withMain([1, 2], 3)).toEqual([1, 2, 3]);
    expect(withMain([1, 2, 3], 1)).toEqual([2, 3, 1]);
  });

  it('works with the crossword’s suggestion marks, one square per suggestion', () => {
    const players = [
      { id: 'a', name: 'A', color: '#111111', clueId: null, host: false, online: true },
      { id: 'b', name: 'B', color: '#222222', clueId: null, host: false, online: true },
    ];
    const suggestions = [
      { playerId: 'a', clueId: 's5', letters: ['3'] },
      { playerId: 'b', clueId: 's5', letters: ['3'] },
      { playerId: 'b', clueId: 's6', letters: ['1'] },
    ];
    const marks = cornerMarks(asPuzzle(four), suggestions, players);
    expect(marks.get(5)).toEqual([{ text: '3', color: '#8a8a8a' }]);
    expect(marks.get(6)).toEqual([{ text: '1', color: '#222222' }]);
  });
});

describe('keys', () => {
  it('reads digits by position, so Shift and Ctrl still give them', () => {
    expect(keyDigit({ key: '!', code: 'Digit1' }, '123456789')).toBe('1');
    expect(keyDigit({ key: 'End', code: 'Numpad1' }, '123456789')).toBe('1');
    expect(keyDigit({ key: '0', code: 'Digit0' }, '123456789')).toBe('');
    expect(keyDigit({ key: '7', code: 'Digit7' }, '123456')).toBe('');
  });

  it('reads letters for puzzles that use them', () => {
    expect(keyDigit({ key: 'b', code: 'KeyB' }, 'ABCDEF')).toBe('B');
    expect(keyDigit({ key: 'z', code: 'KeyZ' }, '123456789')).toBe('');
  });
});

describe('pencil marks', () => {
  it('adds a digit to every square, in order, unless they all have it', () => {
    const marks = { 0: '13', 1: '3' };
    expect(toggleMarks(marks, [0, 1, 2], '2', '1234')).toEqual({ 0: '123', 1: '23', 2: '2' });
    expect(toggleMarks(marks, [0, 1], '1', '1234')).toEqual({ 0: '13', 1: '13' });
    expect(toggleMarks(marks, [0, 1], '3', '1234')).toEqual({ 0: '1' });
  });

  it('drops squares from a record', () => {
    expect(without({ 0: 'a', 3: 'b', 5: 'c' }, [3, 4])).toEqual({ 0: 'a', 5: 'c' });
  });

  it('merges several players’ marks, the first layer’s colour winning', () => {
    const merged = mergeMarks('123456789', [{ marks: '15' }, { marks: '58', color: 'red' }, { marks: '2', color: 'blue' }, {}]);
    expect(merged).toEqual([{ digit: '1' }, { digit: '2', color: 'blue' }, { digit: '5' }, { digit: '8', color: 'red' }]);
  });

  it('puts corner marks in the corners, then along the edges, the rest sharing the last place', () => {
    expect(cornerPlaces([1, 2])).toEqual([[1], [2], [], [], [], [], [], []]);
    expect(cornerPlaces([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([[1], [2], [3], [4], [5], [6], [7], [8, 9]]);
  });
});

describe('region lines', () => {
  it('draws lines between boxes only', () => {
    expect(regionLines(four)).toBe('M2 0v1M0 2h1M2 1v1M1 2h1M2 2h1M3 2h1M2 2v1M2 3v1');
  });

  it('follows irregular regions', () => {
    // 0 0 1
    // 2 0 1
    // 2 2 1
    const s = { ...sudoku(3, 3, 3), regions: [0, 0, 1, 2, 0, 1, 2, 2, 1] };
    expect(regionLines(s)).toBe('M0 1h1M2 0v1M1 1v1M2 1v1M1 2h1M2 2v1');
  });
});
