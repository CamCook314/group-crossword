// The co-op half of the host's full view: the shared board with everyone's suggestions, where the host can type
// straight onto the real crossword, plus the suggestion queue, players, the anagram pad and the replay.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AnagramPad } from '../../shared/AnagramPad';
import { textOn } from '../../shared/color';
import { CoopCell } from '../../shared/CoopCell';
import { answerLabel, ClueLists, cursorClass, Grid, useCursor } from '../../shared/Crossword';
import { puzzleKey, slotBreaks, wordBreaks, type Puzzle } from '../../shared/puzzle';
import { ReplayPlayer } from '../../shared/ReplayPlayer';
import { AGREED_BY, AGREED_COLOR, cornerMarks } from '../../shared/suggestions';
import type { Command, FullViewStatus, SidebarStatus } from './messages';
import { SuggestionList } from './SuggestionList';

interface Props {
  status: SidebarStatus;
  replay: FullViewStatus['replay'];
  send: (msg: Command) => void;
}

export function CoopView(props: Props) {
  const { puzzle } = props.status.state;
  if (!puzzle) return <p class="hint center">Open a crossword on Crosshare or Courier Mail.</p>;
  return <CoopBoard key={puzzleKey(puzzle)} {...props} puzzle={puzzle} />;
}

function CoopBoard({ status, replay, send, puzzle }: Props & { puzzle: Puzzle }) {
  const { state, host } = status;
  /** Letters typed here on their way into the real crossword: shown until the page reports them. */
  const [pending, setPending] = useState<Record<number, string>>({});
  const [tool, setTool] = useState<'anagram' | 'replay' | null>(null);
  const marks = useMemo(() => cornerMarks(puzzle, state.suggestions, state.players), [puzzle, state.suggestions, state.players]);
  const breaks = useMemo(() => wordBreaks(puzzle), [puzzle]);
  const shown = (cell: number) => (cell in pending ? pending[cell] : state.letters[cell]);

  useEffect(() => setPending(p => Object.fromEntries(Object.entries(p).filter(([cell, letter]) => state.letters[+cell] !== letter))), [state.letters]);

  function type(cells: { cell: number; letter: string }[]) {
    if (!cells.length) return;
    setPending(p => ({ ...p, ...Object.fromEntries(cells.map(c => [c.cell, c.letter])) }));
    send({ type: 'type', cells });
    // Give up on showing them if the site never takes them.
    setTimeout(() => setPending(p => Object.fromEntries(Object.entries(p).filter(([cell]) => !cells.some(c => c.cell === +cell)))), 5000);
  }

  const cursor = useCursor(puzzle, {
    isEmpty: cell => !shown(cell),
    hasLetter: cell => Boolean(shown(cell)),
    setLetter: (cell, letter) => type([{ cell, letter }]),
    disabled: tool === 'replay',
  });
  const { answer } = cursor;
  const answerCells = answer.flatMap(part => part.cells);
  const colorOf = (by: string) => (by === AGREED_BY ? AGREED_COLOR : state.players.find(p => p.id === by)?.color);

  return (
    <div class="coop">
      <div class="solver" style={{ '--me': host.color }}>
        <div class="clue-bar">
          <div class="clue-bar-text">{cursor.clue && <><b>{answerLabel(answer)}</b> {answer[0].text}</>}</div>
          <button class="secondary" onClick={() => setTool(tool === 'anagram' ? null : 'anagram')}>
            Anagram
          </button>
          <button class="secondary" onClick={() => setTool('replay')} disabled={!replay.events.length}>
            Replay
          </button>
        </div>
        {tool === 'anagram' && cursor.clue && (
          <div class="tool-panel">
            <AnagramPad
              key={answerLabel(answer)}
              slots={answerCells.map(shown)}
              breaks={slotBreaks(answer)}
              onUse={letters => {
                type(letters.flatMap((letter, i) => (letter ? [{ cell: answerCells[i], letter }] : [])));
                setTool(null);
              }}
              onClose={() => setTool(null)}
            />
          </div>
        )}
        <div class="main">
          <Grid
            puzzle={puzzle}
            cellClass={cell => cursorClass(cursor, cell)}
            onCellDown={cursor.selectCell}
            breaks={breaks}
            renderCell={cell => (
              <CoopCell puzzle={puzzle} cell={cell} letter={state.letters[cell]} draft={cell in pending ? pending[cell] : undefined} marks={marks.get(cell)} />
            )}
          />
          <ClueLists
            puzzle={puzzle}
            current={answer.map(c => c.id)}
            crossing={cursor.crossing?.id}
            refs={cursor.refs}
            onSelect={cursor.selectClue}
            after={c =>
              state.players
                .filter(p => !p.host && p.online && p.clueId === c.id)
                .map(p => (
                  <span class="badge" style={{ background: p.color, color: textOn(p.color) }} title={p.name}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                ))
            }
          />
        </div>
        <p class="help">Type here and your letters go straight onto the crossword. Space switches direction.</p>
      </div>

      <aside>
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

      {tool === 'replay' && (
        <div class="modal-backdrop" onClick={e => e.target === e.currentTarget && setTool(null)}>
          <div class="modal">
            <div class="modal-head">
              <h2>Replay</h2>
              <button class="secondary" onClick={() => setTool(null)}>
                Close
              </button>
            </div>
            <ReplayPlayer
              puzzle={puzzle}
              events={replay.events}
              durationMs={replay.durationMs}
              boards={[{ id: 'shared', label: puzzle.title, color: host.color }]}
              colorOf={colorOf}
            />
          </div>
        </div>
      )}
    </div>
  );
}
