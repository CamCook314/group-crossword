import { useEffect, useMemo, useState } from 'preact/hooks';
import { AnagramPad } from '../../shared/AnagramPad';
import { textOn } from '../../shared/color';
import { CoopCell } from '../../shared/CoopCell';
import { answerLabel, ClueLists, cursorClass, Grid, useCursor } from '../../shared/Crossword';
import type { GuestMessage, RoomState } from '../../shared/protocol';
import { puzzleKey, slotBreaks, wordBreaks, type Puzzle } from '../../shared/puzzle';
import type { ReplayEvent } from '../../shared/replay';
import { ReplayPlayer } from '../../shared/ReplayPlayer';
import { AGREED_BY, AGREED_COLOR, cornerMarks, groupSuggestions } from '../../shared/suggestions';

/** The co-op solve so far, from the host, for watching it back. */
export type CoopReplay = { events: ReplayEvent[]; durationMs: number };

interface Props {
  state: RoomState;
  /** This guest's player id. */
  me: string;
  send: (msg: GuestMessage) => void;
  replay: CoopReplay | null;
  requestReplay: () => void;
}

/** What Enter does, depending on how the host accepts suggestions. */
const SUBMIT = {
  manual: { button: 'Suggest', help: 'Enter suggests them to the host.' },
  agreed: { button: 'Suggest', help: 'Enter suggests them; they go in once someone else agrees.' },
  trusted: { button: 'Enter', help: 'Enter puts them straight onto the crossword.' },
};

export function Board(props: Props) {
  const { puzzle } = props.state;
  if (!puzzle) return <p class="center">Waiting for the host to open a crossword…</p>;
  // A new puzzle starts with a fresh selection and no drafts.
  return <Solver key={puzzleKey(puzzle)} {...props} puzzle={puzzle} />;
}

function Solver({ puzzle, state, me, send, replay, requestReplay }: Props & { puzzle: Puzzle }) {
  /** Letters this guest has typed but not yet suggested: cell -> letter. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [tool, setTool] = useState<'anagram' | 'replay' | null>(null);
  const myColor = state.players.find(p => p.id === me)?.color ?? '#888888';
  const marks = useMemo(() => cornerMarks(puzzle, state.suggestions, state.players), [puzzle, state.suggestions, state.players]);
  const breaks = useMemo(() => wordBreaks(puzzle), [puzzle]);
  const player = (id: string) => state.players.find(p => p.id === id);
  const submitText = SUBMIT[state.acceptMode] ?? SUBMIT.manual;

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
      else if (key === 'Escape') cursor.answer.forEach(part => part.cells.forEach(c => setDraft(c, '')));
      else return false;
      return true;
    },
    disabled: tool === 'replay',
  });
  const { clue, answer } = cursor;
  const answerCells = answer.flatMap(part => part.cells);

  useEffect(() => send({ t: 'select', clueId: clue?.id ?? null }), [clue?.id]);

  /** Suggests the drafted letters, one suggestion per entry (a linked answer has several). */
  function submit() {
    for (const part of answer) {
      const letters = part.cells.map(c => drafts[c] ?? '');
      if (letters.some(Boolean)) send({ t: 'suggest', clueId: part.id, letters });
    }
    setDrafts(d => Object.fromEntries(Object.entries(d).filter(([c]) => !cursor.answerCells.has(Number(c)))));
  }

  const hasDraft = answerCells.some(c => drafts[c]);
  // Suggestions for the selected answer, so you can back someone else's without retyping it.
  const here = groupSuggestions(state.suggestions).filter(g => answer.some(part => part.id === g.clueId));

  return (
    <div class="solver" style={{ '--me': myColor }}>
      <div class="clue-bar">
        <div class="clue-bar-text">{clue && <><b>{answerLabel(answer)}</b> {answer[0].text}</>}</div>
        <button class="secondary" onClick={() => setTool(tool === 'anagram' ? null : 'anagram')}>
          Anagram
        </button>
        <button onClick={submit} disabled={!hasDraft} title="Enter">
          {submitText.button}
        </button>
      </div>
      {here.length > 0 && (
        <div class="agree-strip">
          {here.map(g => {
            const part = puzzle.clues.find(c => c.id === g.clueId)!;
            return (
              <div class="agree-item" data-clue={g.clueId}>
                {g.playerIds.map(id => (
                  <span class="dot" style={{ background: player(id)?.color }} />
                ))}
                <span class="who">{g.playerIds.map(id => player(id)?.name ?? 'Someone').join(' + ')}</span>
                {answer.length > 1 && <span class="hint">{g.clueId}</span>}
                <span class="letters">
                  {g.letters.map((l, i) => (
                    <span class={l ? '' : 'blank'}>{l || state.letters[part.cells[i]] || '·'}</span>
                  ))}
                </span>
                {g.playerIds.includes(me) ? (
                  <span class="hint">{g.playerIds.length > 1 ? 'agreed' : 'yours'}</span>
                ) : (
                  <button class="secondary agree" onClick={() => send({ t: 'suggest', clueId: g.clueId, letters: g.letters })}>
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
            slots={answerCells.map(c => drafts[c] || state.letters[c] || '')}
            breaks={slotBreaks(answer)}
            onUse={letters => {
              letters.forEach((letter, i) => letter && setDraft(answerCells[i], letter));
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
          renderCell={cell => <CoopCell puzzle={puzzle} cell={cell} letter={state.letters[cell]} draft={drafts[cell]} marks={marks.get(cell)} />}
        />
        <ClueLists
          puzzle={puzzle}
          current={answer.map(c => c.id)}
          crossing={cursor.crossing?.id}
          refs={cursor.refs}
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
        <button
          class="secondary"
          onClick={() => {
            requestReplay();
            setTool('replay');
          }}
        >
          Replay
        </button>
        <p class="help">Click a clue or square and type to draft letters. {submitText.help} Esc clears.</p>
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
