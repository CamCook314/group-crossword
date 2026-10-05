// Trivia's screen, for everyone; the host also gets the controls (`command`). To be built.
import type { TriviaCommand, TriviaMessage, TriviaState } from '../../../shared/games/trivia';
import type { Player } from '../../../shared/protocol';

interface Props {
  state: TriviaState;
  players: Player[];
  me: string;
  send(msg: TriviaMessage): void;
  command?(cmd: TriviaCommand): void;
}

export function Trivia(_props: Props) {
  return (
    <div class="game">
      <h1>Trivia</h1>
      <p class="hint">Coming soon.</p>
    </div>
  );
}
