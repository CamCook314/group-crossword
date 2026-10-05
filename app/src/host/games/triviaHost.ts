// Trivia, run in the host's tab. To be built (see shared/games/trivia.ts).
import type { TriviaCommand, TriviaMessage, TriviaState } from '../../../../shared/games/trivia';
import type { GameIO } from './io';

export class TriviaHost {
  constructor(private io: GameIO) {}

  state(): TriviaState {
    return { phase: 'setup' };
  }

  /** `online` is everyone playing, the host included. */
  message(_playerId: string, _msg: TriviaMessage, _online: string[]) {}

  command(_cmd: TriviaCommand, _online: string[]) {}

  save(): unknown {
    return null;
  }

  restore(_saved: unknown) {}
}
