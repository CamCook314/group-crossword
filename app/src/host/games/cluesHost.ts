// The cryptic clue race, run in the host's tab. To be built (see shared/games/clues.ts).
import type { ClueRaceCommand, ClueRaceMessage, ClueRaceState } from '../../../../shared/games/clues';
import type { GameIO } from './io';

export class ClueRaceHost {
  constructor(private io: GameIO) {}

  state(): ClueRaceState {
    return { phase: 'setup' };
  }

  /** `online` is everyone playing, the host included. */
  message(_playerId: string, _msg: ClueRaceMessage, _online: string[]) {}

  command(_cmd: ClueRaceCommand, _online: string[]) {}

  save(): unknown {
    return null;
  }

  restore(_saved: unknown) {}
}
