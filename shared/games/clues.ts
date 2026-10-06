// The cryptic clue race: one clue at a time, from George Ho's dataset of clues from newspaper cryptics
// (cryptics.georgeho.org). Everyone guesses privately; the first right answer scores most, and at half time the
// definition is underlined, after which a right answer scores a point less. The answer stays in the host's tab until
// the reveal.

export type ClueRacePhase = 'setup' | 'loading' | 'clue' | 'reveal' | 'done';

/** The clue being played. Its answer, definition and source are only filled in at the reveal. */
export interface ClueInPlay {
  /** The clue without its enumeration. */
  text: string;
  /** E.g. "4,3" or "5-2". */
  enumeration: string;
  /** The crossword it came from, e.g. "Times 27424". */
  puzzle: string;
  /** Where the definition is in `text`, as [start, end] pairs: from half time, and only if it's found there. */
  hint: [number, number][];
  answer: string | null;
  definition: string | null;
  /** The solving blog's post explaining it. */
  source: string | null;
}

/** What players see. */
export interface ClueRaceState {
  phase: ClueRacePhase;
  /** How many clues, and the seconds for each. */
  count: number;
  seconds: number;
  /** The clue being played or just revealed (`index` counts from 0). */
  index: number;
  clue: ClueInPlay | null;
  /** Time left on the clue, by the host's clock, when this state was sent. */
  msLeft: number;
  /** Who has solved the current clue, in order, and what they scored. */
  solved: { id: string; points: number }[];
  /** Points so far, by player id. */
  scores: Record<string, number>;
  /** Why the clues couldn't be fetched, back at the setup. */
  error: string | null;
}

/** A guess at the current clue; only the guesser hears whether it's right. */
export type ClueRaceMessage = { t: 'clues-guess'; guess: string };

/** What the host can do. */
export type ClueRaceCommand =
  | { type: 'start'; count: number; seconds: number }
  /** Show the answer now. */
  | { type: 'reveal' }
  /** The next clue (skipping this one if it isn't revealed yet), or the final scores after the last. */
  | { type: 'next' }
  | { type: 'again' };

export const COUNT = { min: 5, max: 20, default: 10 };
export const SECONDS = { min: 30, max: 180, default: 90 };
export const MAX_GUESS = 60;

/** Just the letters, in capitals: guesses and answers are compared this way. */
export const lettersOf = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');

/** How many letters an enumeration like "4,3" asks for. */
export const enumerationLength = (e: string) => (e.match(/\d+/g) ?? []).reduce((n, d) => n + Number(d), 0);

/** Validates a clue race message from a player, or null if it isn't one. */
export function parseClueRaceMessage(m: Record<string, unknown>): ClueRaceMessage | null {
  if (m.t !== 'clues-guess' || typeof m.guess !== 'string' || m.guess.length > MAX_GUESS) return null;
  const guess = lettersOf(m.guess);
  return guess ? { t: 'clues-guess', guess } : null;
}
