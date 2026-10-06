// The co-op sudoku view, for guests and the host alike, alongside CoopSolver for crosswords: the shared grid with
// everyone's suggestions and shared pencil marks, the rules, selecting squares, SudokuPad's input modes (digits, corner
// and centre marks), drafting and suggesting, 👍 Agree, notes, replay, and the messages everyone sees when the host
// checks or the grid fills up. The host can also write straight into the grid. Styles are in sudoku.css, on top of
// grid.css.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CoopReplay } from '../CoopSolver';
import { BoardArea } from '../Crossword';
import type { PencilMarks, RoomState } from '../protocol';
import { ReplayPlayer } from '../ReplayPlayer';
import { Scratchpad } from '../Scratchpad';
import { AGREED_BY, AGREED_COLOR, cornerMarks, groupSuggestions, type CornerMark } from '../suggestions';
import { useNow } from '../useNow';
import { clashes } from './check';
import { sudokuKey, type Sudoku } from './model';
import { asPuzzle, cornerPlaces, keyDigit, mergeMarks, regionLines, sees, squareId, squareLabel, step, toggleMarks, withMain, without, type Mark } from './view';

type Cells = { cell: number; letter: string }[];

export interface SudokuSolverProps {
  sudoku: Sudoku;
  /** The room. `state.letters` is the shared grid, givens included, one digit per square ('' empty). Sudoku
   * suggestions are one per square: `clueId` is 's' + the square's index and `letters` is [digit]. `state.wrong`,
   * `state.check`, `state.finished` and `state.players` are as for crosswords; `state.marks` holds the pencil marks
   * other players share. A player's `clueId` is the square they've selected ('s' + index), or null. */
  state: RoomState;
  /** Your player id. */
  me: string;
  /** Suggests a digit for a square; '' takes your suggestion for it back. */
  suggest(cell: number, digit: string): void;
  /** Tells everyone which square you've selected. */
  select(cell: number | null): void;
  /** Shares your pencil marks (and updates them while shared), or null to stop sharing. */
  shareMarks(marks: PencilMarks | null): void;
  /** The host only: writes digits straight into the grid. */
  write?(cells: Cells): void;
  /** Extra buttons for the top bar (the host's Check), given the selected squares. */
  actions?(selected: number[]): ComponentChildren;
  /** Shown with the message once the grid is solved or full (the host's Fill in). */
  finishedExtra?: ComponentChildren;
  replay: CoopReplay | null;
  requestReplay(): void;
  /** Under the board, e.g. the players. */
  footer?: ComponentChildren;
}

type Mode = 'digit' | 'corner' | 'centre';

/** The input modes, as in SudokuPad, with the keys that pick them. Holding Shift also gives corner marks, and Ctrl centre marks. */
const MODES: { mode: Mode; label: string; key: string; title: string }[] = [
  { mode: 'digit', label: 'Digit', key: 'Z', title: 'Digits (Z)' },
  { mode: 'corner', label: 'Corner', key: 'X', title: 'Corner marks (X, or hold Shift while typing)' },
  { mode: 'centre', label: 'Centre', key: 'C', title: 'Centre marks (C, or hold Ctrl while typing)' },
];

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** What Enter does, depending on how the host accepts suggestions. */
const SUBMIT = {
  manual: { button: 'Suggest', help: 'Enter suggests them to the host.' },
  agreed: { button: 'Suggest', help: 'Enter suggests them; they go in once someone else agrees.' },
  trusted: { button: 'Enter', help: 'Enter puts them straight into the grid.' },
};

const FINISHED = {
  solved: 'Solved! 🎉',
  wrong: 'The grid’s full, but something’s not right.',
  full: 'The grid’s full.',
};

export function SudokuSolver(props: SudokuSolverProps) {
  // A new puzzle starts with a fresh selection and no drafts.
  return <Solver key={sudokuKey(props.sudoku)} {...props} />;
}

function Solver({ sudoku, state, me, suggest, select, shareMarks, write, actions, finishedExtra, replay, requestReplay, footer }: SudokuSolverProps) {
  /** The selected squares. The last is the main one: arrow keys move it, and everyone sees it. */
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<Mode>('digit');
  /** Digits you've typed but not yet suggested: cell -> digit. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  /** The host's digits on their way into the grid: shown until the grid has them. */
  const [pending, setPending] = useState<Record<number, string>>({});
  /** Your pencil marks, and whether everyone sees them. After a reload, whatever you were sharing. */
  const [marks, setMarks] = useState<PencilMarks>(() => state.marks?.[me] ?? { corner: {}, centre: {} });
  const [sharing, setSharing] = useState(() => Boolean(state.marks?.[me]));
  const [writing, setWriting] = useState(Boolean(write));
  const [tool, setTool] = useState<'replay' | null>(null);
  const [notes, setNotes] = useState(false);
  /** When the host's latest check arrived here (timed on this computer's clock, not the host's). */
  const [checkSeen, setCheckSeen] = useState(0);
  const now = useNow(Date.now() - checkSeen < 5000, 1000);
  const myColor = state.players.find(p => p.id === me)?.color ?? '#888888';
  const puzzle = useMemo(() => asPuzzle(sudoku), [sudoku]);
  const lines = useMemo(() => regionLines(sudoku), [sudoku]);
  const suggested = useMemo(() => cornerMarks(puzzle, state.suggestions, state.players), [puzzle, state.suggestions, state.players]);
  const player = (id: string) => state.players.find(p => p.id === id);
  // The host suggests when unsure, so even with trusted friends their suggestions wait for someone to agree.
  const submitText = SUBMIT[write && state.acceptMode === 'trusted' ? 'agreed' : state.acceptMode] ?? SUBMIT.manual;
  const shown = (cell: number) => (cell in pending ? pending[cell] : state.letters[cell]);
  /** The digit you see in a square: given, entry, or your draft or pending one. */
  const digitAt = (cell: number) => drafts[cell] || shown(cell);
  const main = selected.at(-1);

  useEffect(() => setPending(p => Object.fromEntries(Object.entries(p).filter(([cell, letter]) => state.letters[+cell] !== letter))), [state.letters]);
  useEffect(() => select(main ?? null), [main]);
  useEffect(() => void (state.check && setCheckSeen(Date.now())), [state.check?.at]);
  useEffect(() => void (sharing && shareMarks(marks)), [sharing, marks]);
  // When zoomed in, keep the main square in view.
  useEffect(() => document.querySelector('.grid-box .cell.cursor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), [main]);

  function writeIn(cells: Cells) {
    if (!write || !cells.length) return;
    setPending(p => ({ ...p, ...Object.fromEntries(cells.map(c => [c.cell, c.letter])) }));
    write(cells);
    // Give up on showing them if the grid never takes them.
    setTimeout(() => setPending(p => Object.fromEntries(Object.entries(p).filter(([cell]) => !cells.some(c => c.cell === +cell)))), 5000);
  }

  /** Types a digit into the selected squares: a draft, the digit itself (when writing), or a pencil mark. Givens never change. */
  function type(digit: string, as: Mode) {
    if (as !== 'digit') {
      const cells = selected.filter(cell => !digitAt(cell));
      if (cells.length) setMarks(m => ({ ...m, [as]: toggleMarks(m[as], cells, digit, sudoku.digits) }));
    } else if (writing) writeIn(selected.filter(cell => !sudoku.givens[cell]).map(cell => ({ cell, letter: digit })));
    else setDrafts(d => ({ ...d, ...Object.fromEntries(selected.filter(cell => !shown(cell)).map(cell => [cell, digit])) }));
  }

  /** Clears your drafts in the selection (or its digits, when writing), or the mode's kind of pencil mark. */
  function clear() {
    if (mode !== 'digit') setMarks(m => ({ ...m, [mode]: without(m[mode], selected) }));
    else if (writing) writeIn(selected.filter(cell => !sudoku.givens[cell] && shown(cell)).map(cell => ({ cell, letter: '' })));
    else setDrafts(d => without(d, selected));
  }

  /** Suggests the drafted digits in the selection, one suggestion per square. */
  function submit() {
    const cells = selected.filter(cell => drafts[cell]);
    cells.forEach(cell => suggest(cell, drafts[cell]));
    setDrafts(d => without(d, cells));
  }

  function onKey(e: KeyboardEvent): boolean {
    const digit = keyDigit(e, sudoku.digits);
    const ctrl = e.ctrlKey || e.metaKey;
    // Ctrl only types centre marks; other shortcuts are the browser's.
    if (tool === 'replay' || e.altKey || (ctrl && !digit)) return false;
    const arrow = ARROWS[e.key];
    if (digit) type(digit, ctrl ? 'centre' : e.shiftKey ? 'corner' : mode);
    else if (arrow) {
      const cell = main === undefined ? 0 : step(sudoku, main, ...arrow);
      setSelected(e.shiftKey ? withMain(selected, cell) : [cell]);
    } else if (e.key === 'Backspace' || e.key === 'Delete') clear();
    else if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') setDrafts(d => without(d, selected));
    else {
      const picked = MODES.find(m => m.key === e.key.toUpperCase());
      if (!picked) return false;
      setMode(picked.mode);
    }
    return true;
  }

  // Keys can arrive faster than effects run, so the listener always calls the handler from the latest render.
  const latestOnKey = useRef(onKey);
  latestOnKey.current = onKey;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (latestOnKey.current(e)) e.preventDefault();
    };
    addEventListener('keydown', listener);
    return () => removeEventListener('keydown', listener);
  }, []);

  const values = sudoku.givens.map((_, cell) => digitAt(cell));
  const clash = clashes(sudoku, values);
  const wrong = new Set(state.wrong);
  const others = state.players.filter(p => p.id !== me && p.online);
  const shared = Object.entries(state.marks ?? {}).flatMap(([id, m]) => (id === me ? [] : [{ marks: m, color: player(id)?.color ?? '#888888' }]));
  /** A square's marks of one kind: yours, then those others share. */
  const marksAt = (cell: number, kind: 'corner' | 'centre') =>
    mergeMarks(sudoku.digits, [{ marks: marks[kind][cell] }, ...shared.map(s => ({ marks: s.marks[kind][cell], color: s.color }))]);
  /** Other players' selected squares, outlined in their colours. */
  const outlines = (cell: number) =>
    others
      .filter(p => p.clueId === squareId(cell))
      .map((p, i) => `inset 0 0 0 ${0.06 * (i + 1)}em ${p.color}`)
      .join(', ');
  const cellClass = (cell: number) =>
    [
      cell === main ? 'cursor' : selected.includes(cell) ? 'selected' : main !== undefined && sees(sudoku, main, cell) && 'peer',
      wrong.has(cell) && 'wrong',
      suggested.has(cell) && 'has-suggestions',
    ]
      .filter(Boolean)
      .join(' ');

  const hasDraft = selected.some(cell => drafts[cell]);
  // Suggestions for the selected squares, so you can back someone else's (or take back yours).
  const ids = selected.map(squareId);
  const here = groupSuggestions(state.suggestions).filter(g => ids.includes(g.clueId));
  const checkShown = state.check && now - checkSeen < 5000;
  const help =
    mode !== 'digit'
      ? `Type to note digits in the ${mode === 'corner' ? 'corners' : 'centre'}. ${sharing ? 'Everyone sees your marks.' : 'Only you see your marks.'}`
      : writing
        ? 'Type and your digits go straight into the grid.'
        : `Type to draft digits. ${submitText.help} Esc clears.`;

  return (
    <div class="solver" style={{ '--me': myColor }}>
      <div class="clue-bar">
        <div class="clue-bar-text">
          <b>{sudoku.title}</b>
          {sudoku.author && ` by ${sudoku.author}`}
        </div>
        <span class="input-modes">
          {MODES.map(m => (
            <button class={m.mode === mode ? 'secondary picked' : 'secondary'} title={m.title} onClick={() => setMode(m.mode)}>
              {m.label}
            </button>
          ))}
        </span>
        {write && (
          <span class="write-mode" title="Write digits straight in, or suggest them like everyone else">
            {[true, false].map(w => (
              <button class={w === writing ? 'mode picked' : 'mode'} onClick={() => setWriting(w)}>
                {w ? 'Write in' : 'Suggest'}
              </button>
            ))}
          </span>
        )}
        <button
          class={sharing ? 'secondary share-marks picked' : 'secondary share-marks'}
          title={sharing ? 'Everyone sees your pencil marks, in your colour' : 'Only you see your pencil marks'}
          onClick={() => {
            if (sharing) shareMarks(null);
            setSharing(!sharing);
          }}
        >
          Share my marks
        </button>
        {actions?.(selected)}
        {/* Kept while drafts are left over from suggesting, so they can still be suggested. */}
        {(!writing || hasDraft) && (
          <button onClick={submit} disabled={!hasDraft} title="Enter">
            {submitText.button}
          </button>
        )}
      </div>

      <div class="main">
        <BoardArea
          tools={
            <>
              <button class={notes ? 'secondary picked' : 'secondary'} onClick={() => setNotes(!notes)}>
                Notes
              </button>
              <button
                class="secondary"
                onClick={() => {
                  requestReplay();
                  setTool('replay');
                }}
              >
                Replay
              </button>
              <span class="help">{help}</span>
            </>
          }
          below={notes && <Scratchpad storageKey={`notes:${sudokuKey(sudoku)}`} />}
        >
          <div class="grid sudoku-grid" style={{ '--cols': sudoku.cols }}>
            {values.map((digit, cell) => (
              <div
                class={`cell ${cellClass(cell)}`}
                data-cell={cell}
                style={{ boxShadow: outlines(cell) || undefined }}
                onMouseDown={e => {
                  e.preventDefault();
                  setSelected(e.ctrlKey || e.metaKey || e.shiftKey ? withMain(selected, cell) : [cell]);
                }}
                // Dragging adds the squares it passes over.
                onMouseEnter={e => e.buttons === 1 && setSelected(s => (s.includes(cell) ? s : [...s, cell]))}
              >
                <Square
                  digit={digit}
                  kind={sudoku.givens[cell] ? 'given' : drafts[cell] || cell in pending ? 'draft' : 'entry'}
                  clash={clash.has(cell)}
                  corner={marksAt(cell, 'corner')}
                  centre={marksAt(cell, 'centre')}
                  suggested={suggested.get(cell)}
                />
              </div>
            ))}
            <svg class="regions" viewBox={`0 0 ${sudoku.cols} ${sudoku.rows}`} preserveAspectRatio="none">
              <path d={lines} />
            </svg>
          </div>
        </BoardArea>

        <div class="side">
          <div class="sudoku-rules">
            <p>
              <b>{sudoku.title}</b>
              {sudoku.author && ` by ${sudoku.author}`}
            </p>
            <p class="rules-text">{sudoku.rules}</p>
          </div>
          {here.length > 0 && (
            <div class="agree-strip">
              {here.map(g => {
                const cell = Number(g.clueId.slice(1));
                const mine = g.playerIds.includes(me);
                return (
                  <div class="agree-item" data-clue={g.clueId}>
                    {g.playerIds.map(id => (
                      <span class="dot" style={{ background: player(id)?.color }} />
                    ))}
                    <span class="who">{g.playerIds.map(id => (id === me ? 'You' : (player(id)?.name ?? 'Someone'))).join(' + ')}</span>
                    {selected.length > 1 && <span class="hint">{squareLabel(sudoku, cell)}</span>}
                    <span class="letters">
                      <span>{g.letters[0]}</span>
                    </span>
                    {mine ? (
                      <button class="secondary withdraw" title="Take back your suggestion" onClick={() => suggest(cell, '')}>
                        ✕ Take back
                      </button>
                    ) : (
                      // Replaces any other digit you suggested for the square.
                      <button class="secondary agree" onClick={() => suggest(cell, g.letters[0])}>
                        👍 Agree
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {footer}

      <div class="toasts">
        {checkShown && (
          <div class="toast-item">
            Checked {state.check!.label}: {state.check!.wrong ? `${state.check!.wrong} wrong, marked in red` : 'nothing wrong ✓'}
          </div>
        )}
        {state.finished && (
          <div class={`toast-item finished ${state.finished}`}>
            {FINISHED[state.finished]} {finishedExtra}
          </div>
        )}
      </div>

      {tool === 'replay' && (
        <div class="modal-backdrop" onClick={e => e.target === e.currentTarget && setTool(null)}>
          <div class="modal">
            <div class="modal-head">
              <h2>Replay</h2>
              <button class="secondary" onClick={() => setTool(null)}>
                Close
              </button>
            </div>
            {replay ? (
              replay.events.length ? (
                <ReplayPlayer
                  puzzle={puzzle}
                  events={replay.events}
                  durationMs={replay.durationMs}
                  boards={[{ id: 'shared', label: sudoku.title, color: player('host')?.color ?? myColor }]}
                  colorOf={by => (by === AGREED_BY ? AGREED_COLOR : player(by)?.color)}
                />
              ) : (
                <p class="hint">Nothing to replay yet.</p>
              )
            ) : (
              <p class="hint">Loading…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What a square shows. A digit fills it. Without one, it shows pencil marks: corner marks in the corners and then
 * along the edges (see cornerPlaces), centre marks across the middle; yours in the text colour, others' in theirs.
 * Suggestions sit in a strip along the bottom edge, in the suggester's colour (grey when several agree), with or
 * without a digit. While a square has suggestions, its pencil marks' box stops above the strip (`.has-suggestions` in
 * sudoku.css), so marks and suggestions never overlap.
 */
function Square({
  digit,
  kind,
  clash,
  corner,
  centre,
  suggested = [],
}: {
  digit: string;
  kind: 'given' | 'entry' | 'draft';
  clash: boolean;
  corner: Mark[];
  centre: Mark[];
  suggested?: CornerMark[];
}) {
  const show = (m: Mark) => <span style={{ color: m.color }}>{m.digit}</span>;
  return (
    <>
      {digit ? (
        <span class={`letter ${kind}${clash ? ' clash' : ''}`}>{digit}</span>
      ) : (
        <span class="pencil">
          {cornerPlaces(corner).map((marks, i) => marks.length > 0 && <span class={`corner c${i}`}>{marks.map(show)}</span>)}
          {/* Smaller the more there are, to stay within the middle. */}
          {centre.length > 0 && (
            <span class="centre" style={{ fontSize: `${Math.min(0.24, 0.84 / centre.length)}em` }}>
              {centre.map(show)}
            </span>
          )}
        </span>
      )}
      {suggested.length > 0 && (
        <span class="suggestions">
          {suggested.map(m => (
            <span style={{ color: m.color }}>{m.text}</span>
          ))}
        </span>
      )}
    </>
  );
}
