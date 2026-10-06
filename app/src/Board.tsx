// A guest's co-op view: the shared solving view, with the players underneath.
import { CoopSolver, type CoopReplay } from '../../shared/CoopSolver';
import type { GuestMessage, RoomState } from '../../shared/protocol';
import { isSudoku, puzzleKey } from '../../shared/puzzle';
import { SudokuSolver } from '../../shared/sudoku/SudokuSolver';
import { squareId } from '../../shared/sudoku/view';
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
  const { puzzle } = state;
  if (!puzzle) return <p class="center">Waiting for the host to open a puzzle…</p>;
  const footer = (
    <div class="footer">
      <PlayerList players={state.players} me={me} />
      <button class="secondary" onClick={editProfile}>
        Change your name or colour
      </button>
    </div>
  );
  if (isSudoku(puzzle)) {
    return (
      <SudokuSolver
        key={puzzleKey(puzzle)}
        sudoku={puzzle}
        state={state}
        me={me}
        suggest={(cell, digit) => send({ t: 'suggest', clueId: squareId(cell), letters: [digit] })}
        select={cell => send({ t: 'select', clueId: cell === null ? null : squareId(cell) })}
        shareMarks={marks => send({ t: 'marks', marks })}
        replay={replay}
        requestReplay={requestReplay}
        footer={footer}
      />
    );
  }
  return (
    <CoopSolver
      puzzle={puzzle}
      state={state}
      me={me}
      suggest={(clueId, letters) => send({ t: 'suggest', clueId, letters })}
      select={clueId => send({ t: 'select', clueId })}
      replay={replay}
      requestReplay={requestReplay}
      footer={footer}
    />
  );
}
