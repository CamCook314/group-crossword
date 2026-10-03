import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, formatTime, isFull, ordinal, standings, isSolved, newRacer, places, progress, raceTime, squareStatus, updateLetters, type Racer } from './race';

// 3x3 ring (CAT / O#O / WET), with an alternate solution that has B for the T in the top-right corner.
const main = ['C', 'A', 'T', 'O', '', 'O', 'W', 'E', 'T'];
const alternate = ['C', 'A', 'B', 'O', '', 'O', 'W', 'E', 'T'];
const solutions = [main, alternate];
const grid = (s: string) => [...s].map(c => (c === '.' || c === '#' ? '' : c));

describe('progress', () => {
  it('counts white squares filled and correct', () => {
    expect(progress(solutions, grid('CAX.#.W..'))).toEqual({ filled: 4, correct: 3, total: 8 });
  });

  it('marks each square right or wrong, against whichever solution the grid is closest to', () => {
    expect(squareStatus(solutions, grid('CAX.#.W..'))).toEqual(['right', 'right', 'wrong', '', '', '', 'right', '', '']);
    expect(squareStatus(solutions, grid('CAB.#....'))[2]).toBe('right');
  });

  it('knows when a grid is full and when it is solved, accepting alternates', () => {
    expect(isFull(solutions, grid('CATO#OWE.'))).toBe(false);
    expect(isFull(solutions, grid('CATO#OWEX'))).toBe(true);
    expect(isSolved(solutions, grid('CATO#OWET'))).toBe(true);
    expect(isSolved(solutions, grid('CABO#OWET'))).toBe(true);
    expect(isSolved(solutions, grid('CAXO#OWET'))).toBe(false);
  });
});

describe('checking a racer\'s grid', () => {
  const noPenalty = DEFAULT_SETTINGS;
  const penalty = { ...DEFAULT_SETTINGS, penaltySeconds: 30 };

  it('does nothing until the grid is full', () => {
    const r = updateLetters(newRacer(9), grid('CA.......'), solutions, penalty, 1000);
    expect(r.outcome).toBeNull();
    expect(r.racer.letters).toEqual(grid('CA.......'));
  });

  it('finishes a racer the moment their grid is right', () => {
    const r = updateLetters(newRacer(9), grid('CATO#OWET'), solutions, noPenalty, 5000);
    expect(r).toMatchObject({ outcome: 'finished', racer: { finishedAt: 5000 } });
  });

  it('says not quite for a full, wrong grid, with no penalty when penalties are off', () => {
    const r = updateLetters(newRacer(9), grid('CAXO#OWET'), solutions, noPenalty, 5000);
    expect(r).toMatchObject({ outcome: 'not-quite', penalised: false, racer: { penaltyMs: 0 } });
  });

  it('penalises a wrong grid once per cooldown, and only after a change', () => {
    let racer: Racer = newRacer(9);
    const step = (s: string, now: number) => {
      const r = updateLetters(racer, grid(s), solutions, penalty, now);
      racer = r.racer;
      return r;
    };
    expect(step('CAXO#OWET', 10_000)).toMatchObject({ outcome: 'not-quite', penalised: true }); // +30 s, cooldown to 40 s
    expect(step('CAYO#OWET', 20_000)).toMatchObject({ outcome: 'not-quite', penalised: false }); // fixing during the cooldown is free
    expect(step('CAYO#OWET', 50_000)).toMatchObject({ outcome: null, penalised: false }); // same grid again: not a change
    expect(step('CAZO#OWET', 50_000)).toMatchObject({ outcome: 'not-quite', penalised: true }); // a new wrong change after the cooldown
    expect(racer.penaltyMs).toBe(60_000);
    expect(step('CATO#OWET', 55_000)).toMatchObject({ outcome: 'finished' }); // right during a cooldown still finishes
    expect(step('CATO#OWEX', 56_000).outcome).toBeNull(); // changes after finishing are ignored
    expect(racer.finishedAt).toBe(55_000);
  });
});

describe('times and places', () => {
  it('ranks finished racers by time including penalties; equal times share a place', () => {
    const racer = (finishedAt: number | null, penaltyMs = 0): Racer => ({ ...newRacer(9), finishedAt, penaltyMs });
    const racers = new Map([
      ['quick but penalised', racer(100_000, 60_000)], // 160 s
      ['steady', racer(130_000)], // 130 s
      ['tied', racer(130_000)], // 130 s
      ['still going', racer(null)],
    ]);
    expect(raceTime(racers.get('quick but penalised')!, 0)).toBe(160_000);
    expect(places(racers, 0)).toEqual(new Map([['steady', 1], ['tied', 1], ['quick but penalised', 3]]));
  });
});

describe('formatting times', () => {
  it('shows minutes and seconds, and hours when needed', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(245_999)).toBe('4:05');
    expect(formatTime(3_723_000)).toBe('1:02:03');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });
});

describe('final standings', () => {
  it('ranks finishers by time, then everyone else by squares correct', () => {
    const racer = (letters: string, finishedAt: number | null = null, penaltyMs = 0): Racer => ({ ...newRacer(9), letters: grid(letters), finishedAt, penaltyMs });
    const racers = new Map([
      ['almost', racer('CATO#OWE.')], // 7 right
      ['fast', racer('CATO#OWET', 50_000)],
      ['penalised', racer('CATO#OWET', 40_000, 30_000)], // 70 s
      ['sloppy', racer('CATO#OWXX')], // 6 right, 2 wrong
      ['careful', racer('CATO#OW..')], // 6 right, none wrong
    ]);
    expect(standings(racers, solutions, 0).map(s => [s.id, s.place, s.timeMs, s.correct])).toEqual([
      ['fast', 1, 50_000, 8],
      ['penalised', 2, 70_000, 8],
      ['almost', 3, null, 7],
      ['careful', 4, null, 6],
      ['sloppy', 5, null, 6],
    ]);
  });
});
