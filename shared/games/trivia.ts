// Trivia: rounds of questions from Open Trivia DB. To be built (see expansion.md, "Group games the host picked").

/** What players see. */
export interface TriviaState {
  phase: 'setup';
}

export type TriviaMessage = never;

/** What the host can do. */
export type TriviaCommand = never;

/** Validates a trivia message from a player, or null if it isn't one. */
export function parseTriviaMessage(_m: Record<string, unknown>): TriviaMessage | null {
  return null;
}
