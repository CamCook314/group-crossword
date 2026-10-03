// The co-op solving view, for guests and for the host's full view: the shared grid with everyone's suggestions, the
// clue lists, drafting and suggesting, 👍 Agree, the tools (anagram pad, definitions, notes, replay), and the messages
// everyone sees when the host checks or the grid fills up. The host can also write straight into the grid.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AnagramPad } from './AnagramPad';
import { textOn } from './color';
import { CoopCell } from './CoopCell';
import { answerLabel, BoardArea, ClueLists, cursorClass, Grid, useCursor } from './Crossword';
import { Define } from './Define';
import type { RoomState } from './protocol';
import { puzzleKey, slotBreaks, wordBreaks, type Puzzle } from './puzzle';
import type { ReplayEvent } from './replay';
import { ReplayPlayer } from './ReplayPlayer';
import { Scratchpad } from './Scratchpad';
import { AGREED_BY, AGREED_COLOR, cornerMarks, draftsAfterSubmit, groupSuggestions } from './suggestions';
import { useNow } from './useNow';

/** The co-op solve so far, for watching it back. */
export type CoopReplay = { events: ReplayEvent[]; durationMs: number };

type Cells = { cell: number; letter: string }[];

export interface CoopSolverProps {
  puzzle: Puzzle;
  state: RoomState;
  /** Your player id. */
  me: string;
  /** Suggests letters for an entry; all blank withdraws your suggestion for it. */
  suggest(clueId: string, letters: string[]): void;
  /** Tells everyone which clue you're on. */
  select(clueId: string | null): void;
  /** The host only: writes letters straight into the grid. */
  write?(cells: Cells): void;
  /** Extra clue bar buttons (the host's Check), given the cursor square and the selected answer. */
  actions?(at: { cell: number; answerCells: number[]; label: string }): ComponentChildren;
  /** Shown with the message once the grid is solved or full (the host's Fill in). */
  finishedExtra?: ComponentChildren;
  replay: CoopReplay | null;
  requestReplay(): void;
  /** Under the board and clue lists, e.g. the players. */
  footer?: ComponentChildren;
}

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

export function CoopSolver(props: CoopSolverProps) {
  // A new puzzle starts with a fresh selection and no drafts.
  return <Solver key={puzzleKey(props.puzzle)} {...props} />;
}

function Solver({ puzzle, state, me, suggest, select, write, actions, finishedExtra, replay, requestReplay, footer }: CoopSolverProps) {
  /** Letters you've typed but not yet suggested: cell -> letter. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  /** The host's letters on their way into the grid: shown until the grid has them. */
  const [pending, setPending] = useState<Record<number, string>>({});
  const [writing, setWriting] = useState(Boolean(write));
  const [tool, setTool] = useState<'anagram' | 'define' | 'replay' | null>(null);
  const [notes, setNotes] = useState(false);
  /** When the host's latest check arrived here (timed on this computer's clock, not the host's). */
  const [checkSeen, setCheckSeen] = useState(0);
  const now = useNow(Date.now() - checkSeen < 5000, 1000);
  const myColor = state.players.find(p => p.id === me)?.color ?? '#888888';
  const marks = useMemo(() => cornerMarks(puzzle, state.suggestions, state.players), [puzzle, state.suggestions, state.players]);
  const breaks = useMemo(() => wordBreaks(puzzle), [puzzle]);
  const player = (id: string) => state.players.find(p => p.id === id);
  // The host suggests when unsure, so even with trusted friends their suggestions wait for someone to agree.
  const submitText = SUBMIT[write && state.acceptMode === 'trusted' ? 'agreed' : state.acceptMode] ?? SUBMIT.manual;
  const shown = (cell: number) => (cell in pending ? pending[cell] : state.letters[cell]);

  useEffect(() => setPending(p => Object.fromEntries(Object.entries(p).filter(([cell, letter]) => state.letters[+cell] !== letter))), [state.letters]);

  const setDraft = (cell: number, letter: string) =>
    setDrafts(d => {
      const next = { ...d };
      if (letter) next[cell] = letter;
      else delete next[cell];
      return next;
    });

  function writeIn(cells: Cells) {
    if (!write || !cells.length) return;
    setPending(p => ({ ...p, ...Object.fromEntries(cells.map(c => [c.cell, c.letter])) }));
    write(cells);
    // Give up on showing them if the grid never takes them.
    setTimeout(() => setPending(p => Object.fromEntries(Object.entries(p).filter(([cell]) => !cells.some(c => c.cell === +cell)))), 5000);
  }

  const cursor = useCursor(
    puzzle,
    writing
      ? { isEmpty: cell => !shown(cell), hasLetter: cell => Boolean(shown(cell)), setLetter: (cell, letter) => writeIn([{ cell, letter }]), disabled: tool === 'replay' }
      : {
          isEmpty: cell => !drafts[cell] && !shown(cell),
          hasLetter: cell => Boolean(drafts[cell]),
          setLetter: setDraft,
          onKey: key => {
            if (key === 'Enter') submit();
            else if (key === 'Escape') answerCells.forEach(c => setDraft(c, ''));
            else return false;
            return true;
          },
          disabled: tool === 'replay',
          stayInAnswer: true,
        },
  );
  const { clue, answer } = cursor;
  const answerCells = answer.flatMap(part => part.cells);

  useEffect(() => select(clue?.id ?? null), [clue?.id]);
  useEffect(() => void (state.check && setCheckSeen(Date.now())), [state.check?.at]);

  /** Suggests the drafted letters, one suggestion per entry (a linked answer has several). */
  function submit() {
    for (const part of answer) {
      const letters = part.cells.map(c => drafts[c] ?? '');
      if (letters.some(Boolean)) suggest(part.id, letters);
    }
    setDrafts(d => draftsAfterSubmit(puzzle, d, cursor.answerCells));
  }

  /** Backs someone's suggestion: the same letters, replacing any different ones of yours for that entry. */
  function agree(clueId: string, letters: string[]) {
    if (state.suggestions.some(s => s.playerId === me && s.clueId === clueId)) suggest(clueId, letters.map(() => ''));
    suggest(clueId, letters);
  }

  const hasDraft = answerCells.some(c => drafts[c]);
  // Suggestions for the selected answer, so you can back someone else's (or take back yours).
  const here = groupSuggestions(state.suggestions).filter(g => answer.some(part => part.id === g.clueId));
  const wrong = new Set(state.wrong);
  const answerText = answerCells.map(c => drafts[c] || shown(c) || ' ').join('');
  const checkShown = state.check && now - checkSeen < 5000;

  return (
    <div class="solver" style={{ '--me': myColor }}>
      <div class="clue-bar">
        <div class="clue-bar-text">{clue && <><b>{answerLabel(answer)}</b> {answer[0].text}</>}</div>
        {write && (
          <span class="write-mode" title="Write letters straight in, or suggest them like everyone else">
            {[true, false].map(w => (
              <button class={w === writing ? 'mode picked' : 'mode'} onClick={() => setWriting(w)}>
                {w ? 'Write in' : 'Suggest'}
              </button>
            ))}
          </span>
        )}
        {clue && actions?.({ cell: cursor.sel.cell, answerCells, label: answerLabel(answer) })}
        <button class="secondary" onClick={() => setTool(tool === 'anagram' ? null : 'anagram')}>
          Anagram
        </button>
        <button class="secondary" onClick={() => setTool(tool === 'define' ? null : 'define')}>
          Define
        </button>
        {!writing && (
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
              <span class="help">
                {writing
                  ? 'Type and your letters go straight into the grid. Space switches direction.'
                  : `Type to draft letters. ${submitText.help} Esc clears.`}
              </span>
            </>
          }
          below={notes && <Scratchpad storageKey={`notes:${puzzleKey(puzzle)}`} />}
        >
          <Grid
            puzzle={puzzle}
            cellClass={cell => `${cursorClass(cursor, cell)}${wrong.has(cell) ? ' wrong' : ''}`}
            onCellDown={cursor.selectCell}
            breaks={breaks}
            renderCell={cell => (
              <CoopCell puzzle={puzzle} cell={cell} letter={state.letters[cell]} draft={drafts[cell] ?? (cell in pending ? pending[cell] : undefined)} marks={marks.get(cell)} />
            )}
          />
        </BoardArea>

        <div class="side">
          {here.length > 0 && (
            <div class="agree-strip">
              {here.map(g => {
                const part = puzzle.clues.find(c => c.id === g.clueId)!;
                const mine = g.playerIds.includes(me);
                return (
                  <div class="agree-item" data-clue={g.clueId}>
                    {g.playerIds.map(id => (
                      <span class="dot" style={{ background: player(id)?.color }} />
                    ))}
                    <span class="who">{g.playerIds.map(id => (id === me ? 'You' : (player(id)?.name ?? 'Someone'))).join(' + ')}</span>
                    {answer.length > 1 && <span class="hint">{g.clueId}</span>}
                    <span class="letters">
                      {g.letters.map((l, i) => (
                        <span class={l ? '' : 'blank'}>{l || state.letters[part.cells[i]] || '·'}</span>
                      ))}
                    </span>
                    {mine ? (
                      <button class="secondary withdraw" title="Take back your suggestion" onClick={() => suggest(g.clueId, g.letters.map(() => ''))}>
                        ✕ Take back
                      </button>
                    ) : (
                      <button class="secondary agree" onClick={() => agree(g.clueId, g.letters)}>
                        👍 Agree
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tool === 'anagram' && clue && (
            <div class="tool-panel">
              <AnagramPad
                key={answerLabel(answer)}
                slots={answerCells.map(c => drafts[c] || shown(c) || '')}
                breaks={slotBreaks(answer)}
                onUse={letters => {
                  const cells = letters.flatMap((letter, i) => (letter ? [{ cell: answerCells[i], letter }] : []));
                  if (writing) writeIn(cells);
                  else cells.forEach(c => setDraft(c.cell, c.letter));
                  setTool(null);
                }}
                onClose={() => setTool(null)}
              />
            </div>
          )}
          {tool === 'define' && (
            <div class="tool-panel">
              <Define key={answerLabel(answer)} initial={answerText.includes(' ') ? '' : answerText.toLowerCase()} onClose={() => setTool(null)} />
            </div>
          )}
          <ClueLists
            puzzle={puzzle}
            current={answer.map(c => c.id)}
            crossing={cursor.crossing?.id}
            refs={cursor.refs}
            onSelect={cursor.selectClue}
            done={c => c.cells.every(cell => shown(cell))}
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
                  boards={[{ id: 'shared', label: puzzle.title, color: player('host')?.color ?? myColor }]}
                  colorOf={by => (by === AGREED_BY ? AGREED_COLOR : player(by)?.color)}
                />
              ) : (
                <p class="hint">Nothing to replay yet.</p>
              )
            ) : (
              <p class="hint">Loading… (the host needs version 0.5.0 or later of the extension)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
