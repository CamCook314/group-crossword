import { useEffect, useMemo, useState } from 'preact/hooks';
import { textOn } from '../../shared/color';
import { ClueLists, cursorClass, Grid, useCursor } from '../../shared/Crossword';
import type { GuestMessage, RoomState } from '../../shared/protocol';
import { puzzleKey, type Puzzle } from '../../shared/puzzle';
import { cornerMarks } from '../../shared/suggestions';

interface Props {
  state: RoomState;
  /** This guest's player id. */
  me: string;
  send: (msg: GuestMessage) => void;
}

export function Board({ state, me, send }: Props) {
  const { puzzle } = state;
  if (!puzzle) return <p class="center">Waiting for the host to open a crossword…</p>;
  // A new puzzle starts with a fresh selection and no drafts.
  return <Solver key={puzzleKey(puzzle)} puzzle={puzzle} state={state} me={me} send={send} />;
}

function Solver({ puzzle, state, me, send }: Props & { puzzle: Puzzle }) {
  /** Letters this guest has typed but not yet suggested: cell -> letter. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const myColor = state.players.find(p => p.id === me)?.color ?? '#888888';
  const marks = useMemo(() => cornerMarks(puzzle, state.suggestions, state.players), [puzzle, state.suggestions, state.players]);

  const setDraft = (cell: number, letter: string) =>
    setDrafts(d => {
      const next = { ...d };
      if (letter) next[cell] = letter;
      else delete next[cell];
      return next;
    });

  const cursor = useCursor(puzzle, {
    isEmpty: cell => !drafts[cell] && !state.letters[cell],
    hasLetter: cell => Boolean(drafts[cell]),
    setLetter: setDraft,
    onKey: key => {
      if (key === 'Enter') submit();
      else if (key === 'Escape') cursor.clue?.cells.forEach(c => setDraft(c, ''));
      else return false;
      return true;
    },
  });
  const { clue } = cursor;

  useEffect(() => send({ t: 'select', clueId: clue?.id ?? null }), [clue?.id]);

  function submit() {
    if (!clue) return;
    const letters = clue.cells.map(c => drafts[c] ?? '');
    if (!letters.some(Boolean)) return;
    send({ t: 'suggest', clueId: clue.id, letters });
    setDrafts(d => Object.fromEntries(Object.entries(d).filter(([c]) => !clue.cells.includes(Number(c)))));
  }

  const hasDraft = clue?.cells.some(c => drafts[c]);

  return (
    <div class="solver" style={{ '--me': myColor }}>
      <div class="clue-bar">
        <div class="clue-bar-text">{clue && <><b>{clue.id}</b> {clue.text}</>}</div>
        <button onClick={submit} disabled={!hasDraft} title="Enter">
          Suggest
        </button>
      </div>

      <div class="main">
        <Grid
          puzzle={puzzle}
          cellClass={cell => cursorClass(cursor, cell)}
          onCellDown={cursor.selectCell}
          renderCell={cell => {
            const draft = drafts[cell];
            // Corners fill top-right, top-left, bottom-left, bottom-right; the top-left one sits after the clue number.
            const mark = (i: number) => {
              const m = marks.get(cell)?.[i];
              return m && <span class={`mark m${i}`} style={{ color: m.color }}>{m.text}</span>;
            };
            return (
              <>
                <span class={draft ? 'letter draft' : 'letter'}>{draft || state.letters[cell]}</span>
                <span class="top-left">
                  {puzzle.numbers[cell] && <span class="num">{puzzle.numbers[cell]}</span>}
                  {mark(1)}
                </span>
                {mark(0)}
                {mark(2)}
                {mark(3)}
              </>
            );
          }}
        />
        <ClueLists
          puzzle={puzzle}
          current={clue?.id}
          onSelect={cursor.selectClue}
          after={c =>
            state.players
              .filter(p => p.id !== me && p.online && p.clueId === c.id)
              .map(p => (
                <span class="badge" style={{ background: p.color, color: textOn(p.color) }} title={p.name}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))
          }
        />
      </div>

      <div class="footer">
        <ul class="players">
          {state.players
            .filter(p => p.online)
            .map(p => (
              <li>
                <span class="dot" style={{ background: p.color }} />
                {p.name}
                {p.host && ' (host)'}
                {p.id === me && ' (you)'}
              </li>
            ))}
        </ul>
        <p class="help">Click a clue or square and type to draft letters. Enter suggests them to the host. Esc clears.</p>
      </div>
    </div>
  );
}
