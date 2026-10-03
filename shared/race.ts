// Race mode rules. All times are the host's clock, in milliseconds.
import type { Solutions } from './answers';

export interface RaceSettings {
  /** Racers see a "% filled" bar for each other racer. */
  showOthersProgress: boolean;
  /** Seconds added for a wrong full grid, with a cooldown of the same length; 0 = no penalty. */
  penaltySeconds: number;
}

export const DEFAULT_SETTINGS: RaceSettings = { showOthersProgress: true, penaltySeconds: 0 };
export const DEFAULT_PENALTY_SECONDS = 30;

export interface Racer {
  letters: string[];
  /** When their grid was first full and correct; null while still racing. */
  finishedAt: number | null;
  penaltyMs: number;
  /** No new penalty before this time. */
  cooldownUntil: number;
}

export const newRacer = (cells: number): Racer => ({ letters: Array(cells).fill(''), finishedAt: null, penaltyMs: 0, cooldownUntil: 0 });

const isWhite = (solutions: Solutions, cell: number) => solutions[0][cell] !== '';
const matches = (solution: string[], letters: string[], cell: number) => letters[cell] === solution[cell];

/** The solution a grid is closest to (they only differ when a puzzle has alternate solutions). */
function closest(solutions: Solutions, letters: string[]): string[] {
  const score = (s: string[]) => s.filter((answer, cell) => answer && matches(s, letters, cell)).length;
  return solutions.reduce((best, s) => (score(s) > score(best) ? s : best));
}

/** White squares filled, filled correctly, and in total. */
export function progress(solutions: Solutions, letters: string[]) {
  const solution = closest(solutions, letters);
  let filled = 0;
  let correct = 0;
  let total = 0;
  solution.forEach((answer, cell) => {
    if (!answer) return;
    total++;
    if (letters[cell]) filled++;
    if (matches(solution, letters, cell)) correct++;
  });
  return { filled, correct, total };
}

/** Each square for the race view: '' (empty or black), 'right' or 'wrong'. */
export function squareStatus(solutions: Solutions, letters: string[]): ('' | 'right' | 'wrong')[] {
  const solution = closest(solutions, letters);
  return solution.map((answer, cell) => (!answer || !letters[cell] ? '' : matches(solution, letters, cell) ? 'right' : 'wrong'));
}

export const isFull = (solutions: Solutions, letters: string[]) => solutions[0].every((_, cell) => !isWhite(solutions, cell) || Boolean(letters[cell]));
export const isSolved = (solutions: Solutions, letters: string[]) => solutions.some(s => s.every((answer, cell) => !answer || matches(s, letters, cell)));

export interface LettersResult {
  racer: Racer;
  /** 'finished' the moment the grid is first right; 'not-quite' for a full, wrong grid. */
  outcome: 'finished' | 'not-quite' | null;
  penalised: boolean;
}

/**
 * A racer's grid changed at `now`. A full grid is checked: right finishes them (cooldown or not); wrong is
 * "not quite", plus a penalty if penalties are on and none was given within the last penalty-length.
 * Only changes count, so sitting with a full, wrong grid never earns another penalty.
 */
export function updateLetters(racer: Racer, letters: string[], solutions: Solutions, settings: RaceSettings, now: number): LettersResult {
  const unchanged = letters.length === racer.letters.length && letters.every((l, i) => l === racer.letters[i]);
  if (racer.finishedAt !== null || unchanged) return { racer, outcome: null, penalised: false };
  const next = { ...racer, letters };
  if (!isFull(solutions, letters)) return { racer: next, outcome: null, penalised: false };
  if (isSolved(solutions, letters)) return { racer: { ...next, finishedAt: now }, outcome: 'finished', penalised: false };
  const penalty = settings.penaltySeconds * 1000;
  if (!penalty || now < racer.cooldownUntil) return { racer: next, outcome: 'not-quite', penalised: false };
  return { racer: { ...next, penaltyMs: racer.penaltyMs + penalty, cooldownUntil: now + penalty }, outcome: 'not-quite', penalised: true };
}

/** A finished racer's time: from the start to finishing, plus penalties. */
export const raceTime = (racer: Racer, startedAt: number) => (racer.finishedAt === null ? null : racer.finishedAt - startedAt + racer.penaltyMs);

/** Finished racers' places (1 = fastest, penalties included); equal times share a place. */
export function places(racers: Map<string, Racer>, startedAt: number): Map<string, number> {
  const times = [...racers].flatMap(([id, r]) => {
    const time = raceTime(r, startedAt);
    return time === null ? [] : [{ id, time }];
  });
  times.sort((a, b) => a.time - b.time);
  return new Map(times.map(({ id, time }) => [id, times.findIndex(t => t.time === time) + 1]));
}
