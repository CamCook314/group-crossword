import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { textOn } from '../../shared/color';
import { normalizeLetter, type GuestMessage, type RoomState } from '../../shared/protocol';
import { clueAt, puzzleKey, type Clue, type Dir, type Puzzle } from '../../shared/puzzle';
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

const other = (dir: Dir): Dir => (dir === 'A' ? 'D' : 'A');

function Solver({ puzzle, state, me, send }: Props & { puzzle: Puzzle }) {
  const first = puzzle.clues[0];
  const [sel, setSel] = useState({ cell: first?.cells[0] ?? 0, dir: first?.dir ?? ('A' as Dir) });
  /** Letters this guest has typed but not yet suggested: cell -> letter. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const clue = clueAt(puzzle, sel.cell, sel.dir) ?? clueAt(puzzle, sel.cell, other(sel.dir));
  const myColor = state.players.find(p => p.id === me)?.color ?? '#888888';
  const marks = useMemo(() => cornerMarks(puzzle, state.suggestions, state.players), [puzzle, state.suggestions, state.players]);

  useEffect(() => send({ t: 'select', clueId: clue?.id ?? null }), [clue?.id]);
  useEffect(() => document.querySelector('.clue-list li.current')?.scrollIntoView({ block: 'nearest' }), [clue?.id]);

  function selectCell(cell: number) {
    if (puzzle.blocks[cell]) return;
    if (cell === sel.cell) {
      // Clicking the selected square again switches direction.
      if (clueAt(puzzle, cell, other(sel.dir))) setSel({ cell, dir: other(sel.dir) });
      return;
    }
    setSel({ cell, dir: clueAt(puzzle, cell, sel.dir) ? sel.dir : other(sel.dir) });
  }

  function selectClue(c: Clue) {
    const firstEmpty = c.cells.find(x => !drafts[x] && !state.letters[x]);
    setSel({ cell: firstEmpty ?? c.cells[0], dir: c.dir });
  }

  const setDraft = (cell: number, letter: string) =>
    setDrafts(d => {
      const next = { ...d };
      if (letter) next[cell] = letter;
      else delete next[cell];
      return next;
    });

  function submit() {
    if (!clue) return;
    const letters = clue.cells.map(c => drafts[c] ?? '');
    if (!letters.some(Boolean)) return;
    send({ t: 'suggest', clueId: clue.id, letters });
    setDrafts(d => Object.fromEntries(Object.entries(d).filter(([c]) => !clue.cells.includes(Number(c)))));
  }

  /** Moves one square in a direction, jumping over black squares. */
  function step(dr: number, dc: number) {
    let r = Math.floor(sel.cell / puzzle.cols) + dr;
    let c = (sel.cell % puzzle.cols) + dc;
    for (; r >= 0 && r < puzzle.rows && c >= 0 && c < puzzle.cols; r += dr, c += dc) {
      const cell = r * puzzle.cols + c;
      if (!puzzle.blocks[cell]) return setSel({ cell, dir: clueAt(puzzle, cell, sel.dir) ? sel.dir : other(sel.dir) });
    }
  }

  function arrow(dir: Dir, dr: number, dc: number) {
    if (sel.dir !== dir && clueAt(puzzle, sel.cell, dir)) setSel({ cell: sel.cell, dir });
    else step(dr, dc);
  }

  function onKey(key: string, shift: boolean): boolean {
    const index = clue ? clue.cells.indexOf(sel.cell) : -1;
    const letter = normalizeLetter(key);
    if (letter) {
      setDraft(sel.cell, letter);
      if (clue && index < clue.cells.length - 1) setSel({ cell: clue.cells[index + 1], dir: clue.dir });
      return true;
    }
    switch (key) {
      case 'Backspace':
        if (drafts[sel.cell] || !clue || index <= 0) setDraft(sel.cell, '');
        else {
          setDraft(clue.cells[index - 1], '');
          setSel({ cell: clue.cells[index - 1], dir: clue.dir });
        }
        return true;
      case 'Delete':
        setDraft(sel.cell, '');
        return true;
      case 'Enter':
        submit();
        return true;
      case 'Escape':
        clue?.cells.forEach(c => setDraft(c, ''));
        return true;
      case 'Tab': {
        const i = clue ? puzzle.clues.indexOf(clue) : -1;
        const n = puzzle.clues.length;
        selectClue(puzzle.clues[(i + (shift ? -1 : 1) + n) % n]);
        return true;
      }
      case 'ArrowLeft':
        arrow('A', 0, -1);
        return true;
      case 'ArrowRight':
        arrow('A', 0, 1);
        return true;
      case 'ArrowUp':
        arrow('D', -1, 0);
        return true;
      case 'ArrowDown':
        arrow('D', 1, 0);
        return true;
    }
    return false;
  }

  // Keys can arrive faster than effects run, so the listener always calls the handler from the latest render.
  const latestOnKey = useRef(onKey);
  latestOnKey.current = onKey;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      if (latestOnKey.current(e.key, e.shiftKey)) e.preventDefault();
    };
    addEventListener('keydown', listener);
    return () => removeEventListener('keydown', listener);
  }, []);

  const othersOn = (c: Clue) => state.players.filter(p => p.id !== me && p.online && p.clueId === c.id);
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
        <div class="grid" style={{ '--cols': puzzle.cols }}>
          {puzzle.blocks.map((block, cell) => {
            if (block) return <div class="cell block" />;
            const classes = ['cell', clue?.cells.includes(cell) && 'in-clue', cell === sel.cell && 'cursor'].filter(Boolean).join(' ');
            const draft = drafts[cell];
            // Corners fill top-right, top-left, bottom-left, bottom-right; the top-left one sits after the clue number.
            const mark = (i: number) => {
              const m = marks.get(cell)?.[i];
              return m && <span class={`mark m${i}`} style={{ color: m.color }}>{m.text}</span>;
            };
            return (
              <div
                class={classes}
                data-cell={cell}
                onMouseDown={e => {
                  e.preventDefault();
                  selectCell(cell);
                }}
              >
                <span class={draft ? 'letter draft' : 'letter'}>{draft || state.letters[cell]}</span>
                <span class="top-left">
                  {puzzle.numbers[cell] && <span class="num">{puzzle.numbers[cell]}</span>}
                  {mark(1)}
                </span>
                {mark(0)}
                {mark(2)}
                {mark(3)}
              </div>
            );
          })}
        </div>

        <div class="clues">
          {(['A', 'D'] as const).map(dir => (
            <div class="clue-list">
              <h3>{dir === 'A' ? 'Across' : 'Down'}</h3>
              <ol>
                {puzzle.clues
                  .filter(c => c.dir === dir)
                  .map(c => (
                    <li class={c.id === clue?.id ? 'current' : ''} data-clue={c.id} onClick={() => selectClue(c)}>
                      <span class="n">{c.num}</span>
                      <span class="t">{c.text}</span>
                      {othersOn(c).map(p => (
                        <span class="badge" style={{ background: p.color, color: textOn(p.color) }} title={p.name}>
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                      ))}
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
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
