// The bracket game: the host names a category ("best biscuit"), everyone puts forward one option, and the options go
// into a knockout bracket that everyone votes through, a match at a time, until one is left. Who put forward which
// option stays hidden until the end.

export type BracketPhase = 'category' | 'options' | 'voting' | 'done';

export interface BracketMatch {
  /** Indexes into the options; `b` is null for a bye, where `a` goes straight through. */
  a: number;
  b: number | null;
  /** Shown once the match is decided: the votes for each side, and whether a tie was settled by a coin toss. */
  votesA: number;
  votesB: number;
  coinToss: boolean;
  winner: number | null;
}

/** What players see. */
export interface BracketState {
  phase: BracketPhase;
  category: string;
  /** Who has put an option forward, while options are coming in. */
  submitted: string[];
  /** The options, once voting starts (in no particular order). `by` is only filled in at the end. */
  options: { text: string; by: string | null }[];
  /** Every round of matches so far, the latest last. */
  rounds: BracketMatch[][];
  /** The match being voted on: its index in the latest round. */
  current: number | null;
  /** Who has voted on the current match (not which way). */
  voted: string[];
  winner: number | null;
}

export type BracketMessage =
  /** Your option for the category; sending another replaces it. */
  | { t: 'bracket-option'; text: string }
  /** Your vote on the current match. */
  | { t: 'bracket-vote'; pick: 'a' | 'b' };

/** What the host can do. */
export type BracketCommand =
  | { type: 'category'; text: string }
  /** Close the options and seed the bracket. */
  | { type: 'make-bracket' }
  /** Settle the current match with the votes so far. */
  | { type: 'decide' }
  | { type: 'again' };

export const MAX_OPTION = 60;

/** Validates a bracket message from a player, or null if it isn't one. */
export function parseBracketMessage(m: Record<string, unknown>): BracketMessage | null {
  if (m.t === 'bracket-option' && typeof m.text === 'string' && m.text.trim()) return { t: 'bracket-option', text: m.text.trim().slice(0, MAX_OPTION) };
  if (m.t === 'bracket-vote' && (m.pick === 'a' || m.pick === 'b')) return { t: 'bracket-vote', pick: m.pick };
  return null;
}
