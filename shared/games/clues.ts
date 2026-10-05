// The cryptic clue race: one clue at a time, first right answer scores. To be built (see expansion.md, "Group games the
// host picked").

/** What players see. */
export interface ClueRaceState {
  phase: 'setup';
}

export type ClueRaceMessage = never;

/** What the host can do. */
export type ClueRaceCommand = never;

/** Validates a clue race message from a player, or null if it isn't one. */
export function parseClueRaceMessage(_m: Record<string, unknown>): ClueRaceMessage | null {
  return null;
}
