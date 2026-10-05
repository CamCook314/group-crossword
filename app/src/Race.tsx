// A racer's view of a race: the lobby, the countdown, their own private grid, and the results.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AnagramPad } from '../../shared/AnagramPad';
import { answerLabel, BoardArea, ClueLists, cursorClass, Grid, MiniBoard, useCursor } from '../../shared/Crossword';
import { Define } from '../../shared/Define';
import type { GuestMessage, Player, RaceState, RacerBoard, RoomState } from '../../shared/protocol';
import { puzzleKey, slotBreaks, wordBreaks, type Puzzle } from '../../shared/puzzle';
import { formatTime, ordinal } from '../../shared/race';
import { ReplayPlayer } from '../../shared/ReplayPlayer';
import { Scratchpad } from '../../shared/Scratchpad';
import { Standings } from '../../shared/Standings';
import { useNow } from '../../shared/useNow';

/** The host's "not quite" for a full, wrong grid, and when it arrived. */
export interface NotQuite {
  penaltyMs: number;
  cooldownMs: number;
  at: number;
}

interface Props {
  state: RoomState;
  me: string;
  send: (msg: GuestMessage) => void;
  notice: NotQuite | null;
  /** Your grid so far, from the host after you rejoin. */
  restore: string[] | null;
  /** Everyone's grid, live, once you've finished. */
  boards: RacerBoard[] | null;
}

const percent = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

export function Race(props: Props) {
  const { state } = props;
  const race = state.race!;
  if (race.phase === 'lobby' || !state.puzzle) return <Lobby state={state} race={race} />;
  if (race.phase === 'done') return <Results state={state} race={race} puzzle={state.puzzle} me={props.me} />;
  return <Racing key={puzzleKey(state.puzzle)} {...props} puzzle={state.puzzle} race={race} />;
}

function Lobby({ state, race }: { state: RoomState; race: RaceState }) {
  const { settings } = race;
  return (
    <div class="race-lobby">
      <h1>Race</h1>
      <p>Waiting for the host to start…</p>
      <Players players={state.players} />
      <ul class="rules">
        <li>{settings.showOthersProgress ? 'You’ll see how far everyone else has got.' : 'Nobody sees anyone else’s progress.'}</li>
        <li>
          {settings.penaltySeconds
            ? `A full grid that’s wrong costs ${settings.penaltySeconds} s, and then there’s no further penalty for ${settings.penaltySeconds} s.`
            : 'No penalty for a full grid that’s wrong.'}
        </li>
      </ul>
    </div>
  );
}

function Racing({ state, me, send, notice, restore, boards, puzzle, race }: Props & { puzzle: Puzzle; race: RaceState }) {
  const [letters, setLetters] = useState<string[]>(() => Array(puzzle.blocks.length).fill(''));
  const mine = race.racers.find(r => r.id === me);
  const finished = mine?.timeMs != null;
  const counting = race.phase === 'countdown';
  // The start time on this computer's clock, worked out from the host's.
  const goAt = useMemo(() => Date.now() + (counting ? race.clockMs : -race.clockMs), [race]);
  const breaks = useMemo(() => wordBreaks(puzzle), [puzzle]);
  const now = useNow(true);
  const [tool, setTool] = useState<'anagram' | 'define' | null>(null);
  const [notes, setNotes] = useState(false);

  useEffect(() => {
    if (restore && restore.length === puzzle.blocks.length) setLetters(restore);
  }, [restore]);

  // Send the grid to the host: straight away once it's full (that's when it gets checked), otherwise after a pause.
  useEffect(() => {
    if (counting) return;
    const full = letters.every((l, cell) => puzzle.blocks[cell] || l);
    const timer = setTimeout(() => send({ t: 'race-letters', letters }), full ? 0 : 300);
    return () => clearTimeout(timer);
  }, [letters, counting]);

  const setLetter = (cell: number, letter: string) =>
    setLetters(ls => {
      const next = [...ls];
      next[cell] = letter;
      return next;
    });
  const cursor = useCursor(puzzle, {
    isEmpty: cell => !letters[cell],
    hasLetter: cell => Boolean(letters[cell]),
    setLetter,
    disabled: counting || finished,
  });

  if (counting) return <div class="countdown">{Math.max(1, Math.ceil((goAt - now) / 1000))}</div>;

  const myColor = state.players.find(p => p.id === me)?.color ?? '#888888';
  const total = puzzle.blocks.filter(b => !b).length;
  const filled = letters.filter((l, cell) => l && !puzzle.blocks[cell]).length;
  const showNotice = notice && now - notice.at < 4000 && !finished;
  const freeFixesMs = notice ? notice.cooldownMs - (now - notice.at) : 0;

  return (
    <div class="solver" style={{ '--me': myColor }}>
      <div class="clue-bar">
        <div class="clue-bar-text">{cursor.clue && <><b>{answerLabel(cursor.answer)}</b> {cursor.answer[0].text}</>}</div>
        {!finished && (
          <button class="secondary" onClick={() => setTool(tool === 'anagram' ? null : 'anagram')}>
            Anagram
          </button>
        )}
        <button class="secondary" onClick={() => setTool(tool === 'define' ? null : 'define')}>
          Define
        </button>
        <div class="race-clock">
          {finished ? (
            <span class="finished">
              Finished {ordinal(mine!.place!)} · {formatTime(mine!.timeMs!)}
            </span>
          ) : (
            formatTime(now - goAt)
          )}
          {mine && mine.penaltyMs > 0 && !finished && <span class="penalty"> +{formatTime(mine.penaltyMs)}</span>}
        </div>
      </div>
      <div class="main">
        <BoardArea
          tools={
            <button class={notes ? 'secondary picked' : 'secondary'} onClick={() => setNotes(!notes)}>
              Notes
            </button>
          }
          below={notes && <Scratchpad storageKey={`notes:${puzzleKey(puzzle)}`} />}
        >
          <Grid
            puzzle={puzzle}
            cellClass={cell => cursorClass(cursor, cell)}
            onCellDown={cursor.selectCell}
            breaks={breaks}
            renderCell={cell => (
              <>
                <span class="letter">{letters[cell]}</span>
                <span class="top-left">{puzzle.numbers[cell] && <span class="num">{puzzle.numbers[cell]}</span>}</span>
              </>
            )}
          />
        </BoardArea>

        <div class="side">
          <div class="progress">
            <ProgressRow player={state.players.find(p => p.id === me)} filled={filled} total={total} label="You" />
            {race.racers
              .filter(r => r.id !== me && r.filled !== null)
              .map(r => (
                <ProgressRow player={state.players.find(p => p.id === r.id)} filled={r.filled!} total={r.total} place={r.place} />
              ))}
          </div>
          {finished && boards && (
            <div class="live-boards">
              {boards
                .filter(b => b.id !== me)
                .map(b => (
                  <figure>
                    <MiniBoard puzzle={puzzle} letters={b.letters} status={b.status} />
                    <figcaption>
                      <span class="dot" style={{ background: state.players.find(p => p.id === b.id)?.color }} />{' '}
                      {state.players.find(p => p.id === b.id)?.name ?? 'Someone'}
                    </figcaption>
                  </figure>
                ))}
            </div>
          )}
          {tool === 'anagram' && !finished && cursor.clue && (
            <div class="tool-panel">
              <AnagramPad
                key={answerLabel(cursor.answer)}
                slots={cursor.answer.flatMap(part => part.cells).map(c => letters[c])}
                breaks={slotBreaks(cursor.answer)}
                onUse={placed => {
                  const cells = cursor.answer.flatMap(part => part.cells);
                  placed.forEach((letter, i) => letter && setLetter(cells[i], letter));
                  setTool(null);
                }}
                onClose={() => setTool(null)}
              />
            </div>
          )}
          {tool === 'define' && (
            <div class="tool-panel">
              <Define onClose={() => setTool(null)} />
            </div>
          )}
          <ClueLists
            puzzle={puzzle}
            current={cursor.answer.map(c => c.id)}
            crossing={cursor.crossing?.id}
            refs={cursor.refs}
            onSelect={cursor.selectClue}
            done={c => c.cells.every(cell => letters[cell])}
          />
        </div>
      </div>

      <div class="toasts">
        {showNotice && (
          <div class="toast-item notice">
            Not quite — keep going{notice.penaltyMs > 0 && <b> · +{formatTime(notice.penaltyMs)} penalty</b>}
          </div>
        )}
        {!finished && freeFixesMs > 0 && <div class="toast-item">Free fixes for {formatTime(freeFixesMs + 999)}</div>}
      </div>
    </div>
  );
}

function ProgressRow({ player, filled, total, place, label }: { player?: Player; filled: number; total: number; place?: number | null; label?: string }) {
  return (
    <div class="progress-row" data-player={player?.name}>
      <span class="dot" style={{ background: player?.color }} />
      <span class="who">{label ?? player?.name ?? 'Someone'}</span>
      <div class="bar">
        <div style={{ width: `${percent(filled, total)}%`, background: player?.color }} />
      </div>
      <span class="pct">{place ? `Finished ${ordinal(place)}` : `${percent(filled, total)}% filled`}</span>
    </div>
  );
}

function Results({ state, race, puzzle, me }: { state: RoomState; race: RaceState; puzzle: Puzzle; me: string }) {
  const results = race.results;
  if (!results) return null;
  const player = (id: string) => state.players.find(p => p.id === id);
  const mistakes = (letters: string[]) => letters.map((l, cell) => (!l || puzzle.blocks[cell] ? '' : l === results.solution[cell] ? 'right' : 'wrong'));
  // Extensions before 0.5.0 send no standings or replay: work the standings out from the boards.
  const ranked =
    results.standings ??
    race.racers
      .map(r => ({ ...r, finishedMs: null, correct: mistakes(results.boards[r.id] ?? []).filter(m => m === 'right').length }))
      .sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || b.correct - a.correct)
      .map((s, i) => ({ ...s, place: i + 1 }));
  return (
    <div class="race-results">
      <h1>Results</h1>
      <Standings standings={ranked} player={player} me={me} />
      <h2>Solution{results.winner ? ` · ${player(results.winner)?.name ?? 'the winner'}’s board` : ''}</h2>
      <MiniBoard puzzle={puzzle} letters={results.solution} />
      {results.replay && (
        <>
          <h2>Replay</h2>
          <ReplayPlayer
            puzzle={puzzle}
            events={results.replay}
            durationMs={results.durationMs}
            solution={results.solution}
            boards={ranked.map(s => ({ id: s.id, label: player(s.id)?.name ?? 'Someone', color: player(s.id)?.color ?? '#888888', finishedAt: s.finishedMs }))}
          />
        </>
      )}
      <h2>Everyone’s boards</h2>
      <div class="boards">
        {ranked.map(r => (
          <figure>
            <MiniBoard puzzle={puzzle} letters={results.boards[r.id] ?? []} status={mistakes(results.boards[r.id] ?? [])} />
            <figcaption>
              <span class="dot" style={{ background: player(r.id)?.color }} /> {player(r.id)?.name ?? 'Someone'}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function Players({ players }: { players: Player[] }) {
  return (
    <ul class="players">
      {players
        .filter(p => p.online)
        .map(p => (
          <li>
            <span class="dot" style={{ background: p.color }} />
            {p.name}
          </li>
        ))}
    </ul>
  );
}
