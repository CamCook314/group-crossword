import { describe, expect, it } from 'vitest';
import { circlePositions, keepPlaced, lettersOf, shuffle } from './anagram';

describe('lettersOf', () => {
  it('keeps only A-Z, uppercased', () => {
    expect(lettersOf('Ten ants!')).toEqual(['T', 'E', 'N', 'A', 'N', 'T', 'S']);
    expect(lettersOf('café 2-b')).toEqual(['C', 'A', 'F', 'B']);
    expect(lettersOf('')).toEqual([]);
  });
});

describe('shuffle', () => {
  it('returns a reordered copy, leaving the input alone', () => {
    const items = [1, 2, 3, 4];
    // random() = 0 swaps each item with the first in turn; just under 1 swaps each with itself.
    expect(shuffle(items, () => 0)).toEqual([2, 3, 4, 1]);
    expect(shuffle(items, () => 0.999)).toEqual([1, 2, 3, 4]);
    expect(shuffle(items, () => 0.999)).not.toBe(items);
    expect(items).toEqual([1, 2, 3, 4]);
  });

  it('keeps the same items', () => {
    const letters = lettersOf('anagrams');
    expect(shuffle(letters).sort()).toEqual([...letters].sort());
    expect(shuffle([])).toEqual([]);
  });
});

describe('circlePositions', () => {
  it('spaces items clockwise from the top', () => {
    const [top, right, bottom, left] = circlePositions(4);
    expect(top.x).toBeCloseTo(50);
    expect(top.y).toBeLessThan(50);
    expect(right.x).toBeGreaterThan(50);
    expect(right.y).toBeCloseTo(50);
    expect(bottom.x).toBeCloseTo(50);
    expect(bottom.y).toBeGreaterThan(50);
    expect(left.x).toBeLessThan(50);
    expect(left.y).toBeCloseTo(50);
  });

  it('stays inside the box', () => {
    expect(circlePositions(0)).toEqual([]);
    for (const { x, y } of circlePositions(15)) {
      for (const v of [x, y]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(100);
      }
    }
  });
});

describe('keepPlaced', () => {
  it('keeps placed letters that are still there and returns the rest', () => {
    expect(keepPlaced(lettersOf('TENANTS'), ['N', 'A', '', ''])).toEqual({ placed: ['N', 'A', '', ''], pool: lettersOf('TENTS') });
  });

  it('blanks placed letters that have gone', () => {
    expect(keepPlaced(lettersOf('TENTS'), ['N', 'A', '', 'T'])).toEqual({ placed: ['N', '', '', 'T'], pool: lettersOf('ETS') });
  });

  it('counts repeated letters', () => {
    expect(keepPlaced(['A', 'B'], ['A', 'A', ''])).toEqual({ placed: ['A', '', ''], pool: ['B'] });
  });
});
