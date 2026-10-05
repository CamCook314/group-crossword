// The cryptic clue race's screen, for everyone; the host also gets the controls (`command`). To be built.
import type { ClueRaceCommand, ClueRaceMessage, ClueRaceState } from '../../../shared/games/clues';
import type { Player } from '../../../shared/protocol';

interface Props {
  state: ClueRaceState;
  players: Player[];
  me: string;
  send(msg: ClueRaceMessage): void;
  command?(cmd: ClueRaceCommand): void;
}

export function ClueRace(_props: Props) {
  return (
    <div class="game">
      <h1>Cryptic clue race</h1>
      <p class="hint">Coming soon.</p>
    </div>
  );
}
