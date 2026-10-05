// The screen for whichever game that needs no puzzle the room is playing, for guests and the host alike (the host
// also gets each game's controls).
import type { BracketCommand } from '../../../shared/games/bracket';
import type { ClueRaceCommand } from '../../../shared/games/clues';
import type { TriviaCommand } from '../../../shared/games/trivia';
import type { GuestMessage, Mode, RoomState } from '../../../shared/protocol';
import { Bracket } from './Bracket';
import { ClueRace } from './ClueRace';
import { Trivia } from './Trivia';

export const isGameMode = (mode: Mode | undefined): mode is 'clues' | 'trivia' | 'bracket' => mode === 'clues' || mode === 'trivia' || mode === 'bracket';

interface Props {
  state: RoomState;
  me: string;
  send(msg: Exclude<GuestMessage, { t: 'hello' }>): void;
  /** The host's controls for each game. */
  host?: { clues(cmd: ClueRaceCommand): void; trivia(cmd: TriviaCommand): void; bracket(cmd: BracketCommand): void };
}

export function GameScreen({ state, me, send, host }: Props) {
  const { players } = state;
  if (state.mode === 'bracket' && state.bracket) return <Bracket state={state.bracket} players={players} me={me} send={send} command={host?.bracket} />;
  if (state.mode === 'trivia' && state.trivia) return <Trivia state={state.trivia} players={players} me={me} send={send} command={host?.trivia} />;
  if (state.mode === 'clues' && state.clues) return <ClueRace state={state.clues} players={players} me={me} send={send} command={host?.clues} />;
  return null;
}
