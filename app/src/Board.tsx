// A guest's co-op view: the shared solving view, with the players underneath.
import { CoopSolver, type CoopReplay } from '../../shared/CoopSolver';
import type { GuestMessage, RoomState } from '../../shared/protocol';
import { PlayerList } from './PlayerList';

interface Props {
  state: RoomState;
  /** This guest's player id. */
  me: string;
  send: (msg: GuestMessage) => void;
  replay: CoopReplay | null;
  requestReplay: () => void;
  /** Opens the name and colour picker. */
  editProfile: () => void;
}

export function Board({ state, me, send, replay, requestReplay, editProfile }: Props) {
  if (!state.puzzle) return <p class="center">Waiting for the host to open a crossword…</p>;
  return (
    <CoopSolver
      puzzle={state.puzzle}
      state={state}
      me={me}
      suggest={(clueId, letters) => send({ t: 'suggest', clueId, letters })}
      select={clueId => send({ t: 'select', clueId })}
      replay={replay}
      requestReplay={requestReplay}
      footer={
        <div class="footer">
          <PlayerList players={state.players} me={me} />
          <button class="secondary" onClick={editProfile}>
            Change your name or colour
          </button>
        </div>
      }
    />
  );
}
