import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { solutionsFit } from '../../../shared/answers';
import { parseGuestMessage } from '../../../shared/protocol';
import { buildPuzzle } from '../../../shared/puzzle';
import { COUNTDOWN_MS, RaceHost } from './raceHost';

// 3x3 ring: CAT / O#O / WET
const blocks = [false, false, false, false, true, false, false, false, false];
const puzzle = buildPuzzle('Ring', 3, 3, blocks, [{ num: 1, dir: 'A', text: 'Pet (3)' }]);
const answers = [['C', 'A', 'T', 'O', '', 'O', 'W', 'E', 'T']];
const grid = (s: string) => [...s].map(c => (c === '.' || c === '#' ? '' : c));

describe('RaceHost', () => {
  let changed: () => void;
  let race: RaceHost;
  beforeEach(() => {
    vi.useFakeTimers();
    changed = vi.fn();
    race = new RaceHost(changed);
  });
  afterEach(() => vi.useRealTimers());

  const startRace = (ids = ['sam', 'ana']) => {
    race.start(puzzle, answers, ids, 0);
    vi.advanceTimersByTime(COUNTDOWN_MS);
  };

  it('counts down, then races', () => {
    race.start(puzzle, answers, ['sam'], 0);
    expect(race.stateForRacers(1000)).toMatchObject({ phase: 'countdown', clockMs: COUNTDOWN_MS - 1000 });
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(changed).toHaveBeenCalled();
    expect(race.stateForRacers(COUNTDOWN_MS + 500)).toMatchObject({ phase: 'racing', clockMs: 500 });
  });

  it('never gives racers the answers or how much is correct while racing', () => {
    startRace();
    race.letters('sam', grid('CAX......'), 4000);
    const state = race.stateForRacers(4000);
    expect(JSON.stringify(state)).not.toContain('"correct"');
    expect(state.results).toBeNull();
    expect(state.racers.find(r => r.id === 'sam')).toMatchObject({ filled: 3, total: 8, timeMs: null });
    expect(race.details().find(r => r.id === 'sam')).toMatchObject({ filled: 3, correct: 2, status: ['right', 'right', 'wrong', '', '', '', '', '', ''] });
  });

  it("hides everyone's progress when the host turns it off", () => {
    race.settings = { ...race.settings, showOthersProgress: false };
    startRace();
    race.letters('sam', grid('CA.......'), 4000);
    expect(race.stateForRacers(4000).racers.every(r => r.filled === null)).toBe(true);
  });

  it('lets late joiners in with an empty grid, and gives returning racers their grid back', () => {
    startRace(['sam']);
    race.letters('sam', grid('CA.......'), 4000);
    expect(race.join('sam')).toEqual(grid('CA.......'));
    expect(race.join('lee')).toBeNull();
    expect(race.details().map(r => r.id)).toEqual(['sam', 'lee']);
  });

  it('ignores grids sent before the start', () => {
    race.start(puzzle, answers, ['sam'], 0);
    expect(race.letters('sam', grid('CATO#OWET'), 1000)).toBeNull();
    expect(race.details()[0].finishedAt).toBeNull();
  });

  it('says not quite with the penalty and cooldown, and finishes a right grid', () => {
    race.settings = { ...race.settings, penaltySeconds: 30 };
    startRace(['sam']);
    expect(race.letters('sam', grid('CAXO#OWET'), 10_000)).toEqual({ penaltyMs: 30_000, cooldownMs: 30_000 });
    expect(race.letters('sam', grid('CAYO#OWET'), 15_000)).toEqual({ penaltyMs: 0, cooldownMs: 25_000 });
    expect(race.letters('sam', grid('CATO#OWET'), 20_000)).toBeNull();
    // Started at 3 s, finished at 20 s, plus 30 s of penalty.
    expect(race.stateForRacers(20_000).racers[0]).toMatchObject({ timeMs: 47_000, place: 1, penaltyMs: 30_000 });
  });

  it('knows when everyone still connected has finished', () => {
    startRace();
    race.letters('sam', grid('CATO#OWET'), 9000);
    expect(race.allFinished(['sam', 'ana'])).toBe(false);
    expect(race.allFinished(['sam'])).toBe(true); // ana has left
  });

  it("ends with the winner's board as the solution, or the answers if nobody finished", () => {
    startRace();
    race.letters('ana', grid('CATO#OWET'), 9000);
    race.letters('sam', grid('CA.......'), 9000);
    race.end(12_000);
    expect(race.stateForRacers(12_000)).toMatchObject({
      phase: 'done',
      clockMs: 9000,
      results: { winner: 'ana', solution: grid('CATO#OWET'), boards: { sam: grid('CA.......') }, durationMs: 9000 },
    });
    // Ana first, then Sam ranked on his two right squares.
    expect(race.results!.standings.map(s => [s.id, s.place, s.correct])).toEqual([
      ['ana', 1, 8],
      ['sam', 2, 2],
    ]);
    // The replay has each racer's changes, in order.
    expect(race.results!.replay).toEqual([
      { at: 6000, board: 'ana', by: 'ana', cells: [0, 1, 2, 3, 5, 6, 7, 8].map(c => [c, grid('CATO#OWET')[c]]) },
      { at: 6000, board: 'sam', by: 'sam', cells: [[0, 'C'], [1, 'A']] },
    ]);

    race.reset();
    startRace();
    race.end(10_000);
    expect(race.results).toMatchObject({ winner: null, solution: answers[0] });
  });
});

describe('race rules elsewhere', () => {
  it('only races puzzles with one letter per square', () => {
    expect(solutionsFit(puzzle, answers)).toBe(true);
    expect(solutionsFit(puzzle, [['CA', 'A', 'T', 'O', '', 'O', 'W', 'E', 'T']])).toBe(false);
  });

  it("validates racers' grids", () => {
    // Letters or digits (for sudokus); anything else is a blank.
    expect(parseGuestMessage({ t: 'race-letters', letters: ['a', '', '7', '?'] })).toEqual({ t: 'race-letters', letters: ['A', '', '7', ''] });
    expect(parseGuestMessage({ t: 'race-letters', letters: 'CAT' })).toBeNull();
  });
});
