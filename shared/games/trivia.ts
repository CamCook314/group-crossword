// Trivia: rounds of questions from Open Trivia DB. Everyone, the host included, answers each question privately and can
// change their answer until the reveal: once everyone has answered, the time is up, or the host says so. Then everyone
// sees the right answer and each other's, and scores a point for a right one. The right answer stays in the host's tab
// until the reveal.

export type TriviaPhase = 'setup' | 'loading' | 'question' | 'revealed' | 'done';

export interface TriviaSettings {
  /** An Open Trivia DB category id; null for any. */
  category: number | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  questions: number;
  seconds: number;
}

/** The range of each setting. */
export const QUESTIONS = { min: 5, max: 20 };
export const SECONDS = { min: 10, max: 60 };

export interface TriviaQuestion {
  text: string;
  category: string;
  difficulty: string;
  /** Shuffled, except True/False, which come in that order. */
  answers: string[];
}

/** What players see. */
export interface TriviaState {
  phase: TriviaPhase;
  /** The latest game's, for the next one. */
  settings: TriviaSettings;
  /** Open Trivia DB's categories, once loaded. */
  categories: { id: number; name: string }[];
  /** Why the questions couldn't be had, for the host. */
  error: string | null;
  /** The current question (from 0) and how many there are. */
  index: number;
  total: number;
  question: TriviaQuestion | null;
  /** Time left for the current question, on the host's clock when this state was made. */
  msLeft: number;
  /** Who has answered the current question (not what). */
  answered: string[];
  /** Once revealed: the right answer and each player's, by index into the answers. */
  correct: number | null;
  picks: Record<string, number> | null;
  /** Points by player id; players who haven't scored aren't in it. */
  scores: Record<string, number>;
}

export type TriviaMessage =
  /** Your answer to the current question; sending another changes it. */
  { t: 'trivia-pick'; answer: number };

/** What the host can do. */
export type TriviaCommand =
  /** Load the categories, if they aren't already. */
  | { type: 'categories' }
  | { type: 'start'; settings: TriviaSettings }
  /** Show the answer now, without waiting for everyone or the clock. */
  | { type: 'reveal' }
  /** The next question, or the scores after the last. */
  | { type: 'next' }
  | { type: 'again' };

/** Validates a trivia message from a player, or null if it isn't one. */
export function parseTriviaMessage(m: Record<string, unknown>): TriviaMessage | null {
  if (m.t === 'trivia-pick' && typeof m.answer === 'number' && Number.isInteger(m.answer) && m.answer >= 0 && m.answer < 4) return { t: 'trivia-pick', answer: m.answer };
  return null;
}
