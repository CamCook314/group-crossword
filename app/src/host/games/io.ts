// What a game that needs no puzzle gets from the host engine.
export interface GameIO {
  /** Something changed by itself (a timer, a fetch): send everyone the new state. */
  changed(): void;
  /** A word for one player only, shown for a moment. */
  tell(playerId: string, text: string, tone: 'good' | 'bad' | 'info'): void;
}
