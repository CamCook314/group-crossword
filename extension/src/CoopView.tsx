// The co-op half of the host's full view: the shared solving view (where the host writes straight into the grid, or
// suggests like everyone else), with Check and Fill in, beside the suggestion queue and the players.
import { CoopSolver } from '../../shared/CoopSolver';
import type { Command, FullViewStatus, SidebarStatus } from './messages';
import { SuggestionList } from './SuggestionList';

interface Props {
  status: SidebarStatus;
  replay: FullViewStatus['replay'];
  send: (msg: Command) => void;
}

export function CoopView({ status, replay, send }: Props) {
  const { state } = status;
  const { puzzle } = state;
  const canCheck = typeof status.answers === 'number';
  const check = (cells: number[], label: string) => send({ type: 'check', cells, label });

  return (
    <div class="coop">
      {puzzle ? (
        <CoopSolver
          puzzle={puzzle}
          state={state}
          me="host"
          suggest={(clueId, letters) => send({ type: 'suggest', clueId, letters })}
          select={clueId => send({ type: 'select', clueId })}
          write={cells => send({ type: 'type', cells })}
          actions={at => (
            <span class="check" title={canCheck ? 'Checks against the answers; wrong squares are marked for everyone' : 'This puzzle’s answers weren’t found'}>
              <span class="hint">Check</span>
              <button class="secondary" disabled={!canCheck} onClick={() => check([at.cell], 'a square')}>
                Square
              </button>
              <button class="secondary" disabled={!canCheck} onClick={() => check(at.answerCells, at.label)}>
                Answer
              </button>
              <button class="secondary" disabled={!canCheck} onClick={() => check(puzzle.blocks.flatMap((block, cell) => (block ? [] : [cell])), 'the grid')}>
                Grid
              </button>
            </span>
          )}
          finishedExtra={
            status.fillIn === 'ready' ? (
              <button onClick={() => send({ type: 'fill-site' })}>Fill in the crossword</button>
            ) : status.fillIn === 'no-tab' ? (
              <span class="hint">Open the crossword’s page to fill it in.</span>
            ) : status.fillIn === 'done' ? (
              <span>Filled in on the site ✓</span>
            ) : null
          }
          replay={replay}
          requestReplay={() => {}}
        />
      ) : (
        <p class="hint center">Open a crossword on Crosshare or Courier Mail.</p>
      )}

      <aside>
        {status.otherPuzzle && (
          <section class="other-puzzle">
            <p>
              Another crossword is open: <b>{status.otherPuzzle.title}</b>
            </p>
            <button class="secondary" onClick={() => send({ type: 'switch-puzzle' })}>
              Play it instead
            </button>
          </section>
        )}
        <section>
          <h2>Suggestions</h2>
          <SuggestionList status={status} send={send} />
        </section>
        <section>
          <h2>Players</h2>
          <ul class="players">
            {state.players.map(p => (
              <li class={p.online ? '' : 'offline'}>
                <span class="dot" style={{ background: p.color }} />
                {p.name}
                {p.host && ' (you)'}
                {!p.online && ' (left)'}
                {p.clueId && <span class="on-clue">{p.clueId}</span>}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
