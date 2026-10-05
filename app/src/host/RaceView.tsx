// The host's race screen: lobby and settings, a live board for every racer (with % correct, which
// racers never see), and the results with a replay.
import { MiniBoard } from '../../../shared/Crossword';
import type { Player } from '../../../shared/protocol';
import { DEFAULT_PENALTY_SECONDS, formatTime, ordinal } from '../../../shared/race';
import { ReplayPlayer } from '../../../shared/ReplayPlayer';
import { Standings } from '../../../shared/Standings';
import { useNow } from '../../../shared/useNow';
import type { Command, RaceViewStatus } from './types';
import type { RacerDetail } from './raceHost';

const percent = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

export function RaceView({ status, send }: { status: RaceViewStatus; send: (msg: Command) => void }) {
  const { phase, goAt } = status;
  const now = useNow(phase === 'countdown' || phase === 'racing');
  const player = (id: string) => status.players.find(p => p.id === id);
  const clock = goAt === null || phase === 'countdown' ? '' : formatTime((status.endedAt ?? now) - goAt);
  // Racing yourself opens the racer's page in its own window, with the join form filled in with your name and colour.
  const play = () =>
    status.session &&
    window.open(`${status.session.link}?name=${encodeURIComponent(status.host.name)}&color=${encodeURIComponent(status.host.color)}`, '_blank');

  return (
    <>
      <div class="race-head">
        <h2>Race</h2>
        {clock && <span class="clock">{clock}</span>}
        {(phase === 'lobby' || phase === 'racing') && (
          <button class="play" onClick={play} disabled={!status.session} title={status.session ? 'Race yourself, in a new window' : 'Start a session first'}>
            Join as a racer
          </button>
        )}
        {phase === 'racing' && (
          <button class="secondary" onClick={() => send({ type: 'end-race' })}>
            End race
          </button>
        )}
        {phase === 'done' && <button onClick={() => send({ type: 'new-race' })}>New race</button>}
      </div>

      {phase === 'lobby' && <Lobby status={status} send={send} />}
      {phase === 'countdown' && goAt !== null && <div class="countdown">{Math.max(1, Math.ceil((goAt - now) / 1000))}</div>}
      {phase === 'done' && <Results status={status} player={player} />}
      {(phase === 'racing' || phase === 'done') && (
        <section class="racers">
          {[...status.racers]
            .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || b.correct - a.correct)
            .map(r => (
              <RacerCard racer={r} player={player(r.id)} status={status} now={now} />
            ))}
        </section>
      )}
    </>
  );
}

function Lobby({ status, send }: { status: RaceViewStatus; send: (msg: Command) => void }) {
  const { session, settings, pagePuzzle, answers } = status;
  const waiting = status.players.filter(p => p.online);
  const answersReady = typeof answers === 'number';
  const problem = !session
    ? 'Start a session first.'
    : !pagePuzzle
      ? 'Open a crossword on Crosshare or Courier Mail.'
      : !answersReady
        ? answers === 'reading'
          ? 'Reading the answers…'
          : "This puzzle's answers can't be found, so it can't be raced."
        : !waiting.length
          ? 'Waiting for someone to join.'
          : null;

  return (
    <>
      <section>
        <h2>Lobby</h2>
        <p class="puzzle">
          {pagePuzzle ? `${pagePuzzle.title} (${pagePuzzle.cols}×${pagePuzzle.rows})` : 'No crossword open'}
          {pagePuzzle && <span class={answersReady ? 'ok' : 'hint'}> · Answers: {answersReady ? `${answers} squares ✓` : answers === 'reading' ? 'reading…' : 'not found'}</span>}
        </p>
        {status.otherPuzzle && (
          <p class="puzzle">
            Also open: <b>{status.otherPuzzle.title}</b>{' '}
            <button class="secondary" onClick={() => send({ type: 'switch-puzzle' })}>
              Play it instead
            </button>
          </p>
        )}
      </section>

      <section>
        <h2>Settings</h2>
        <label class="setting">
          <input
            type="checkbox"
            checked={settings.showOthersProgress}
            onChange={e => send({ type: 'race-settings', settings: { ...settings, showOthersProgress: e.currentTarget.checked } })}
          />
          Show racers how far everyone else has got (% filled)
        </label>
        <label class="setting">
          <input
            type="checkbox"
            checked={settings.penaltySeconds > 0}
            onChange={e =>
              send({ type: 'race-settings', settings: { ...settings, penaltySeconds: e.currentTarget.checked ? DEFAULT_PENALTY_SECONDS : 0 } })
            }
          />
          Time penalty for a full grid that's wrong:
          <input
            class="seconds"
            type="number"
            min={1}
            max={600}
            disabled={settings.penaltySeconds === 0}
            value={settings.penaltySeconds || DEFAULT_PENALTY_SECONDS}
            onChange={e => send({ type: 'race-settings', settings: { ...settings, penaltySeconds: Number(e.currentTarget.value) } })}
          />
          seconds, then no more penalties for that long
        </label>
      </section>

      <section>
        <h2>Racers</h2>
        {waiting.length ? (
          <ul class="waiting">
            {waiting.map(p => (
              <li>
                <span class="dot" style={{ background: p.color }} />
                {p.name}
              </li>
            ))}
          </ul>
        ) : (
          <p class="hint">Nobody yet. Send them the link, or join as a racer yourself.</p>
        )}
        <button class="start" disabled={Boolean(problem)} onClick={() => send({ type: 'start-race' })}>
          Start race
        </button>
        {problem && <p class="hint">{problem}</p>}
      </section>
    </>
  );
}

function RacerCard({ racer, player, status, now }: { racer: RacerDetail; player?: Player; status: RaceViewStatus; now: number }) {
  const running = status.goAt !== null ? formatTime((status.endedAt ?? now) - status.goAt + racer.penaltyMs) : '';
  const standing = status.results?.standings.find(s => s.id === racer.id);
  return (
    <div class={racer.finishedAt !== null ? 'card finished' : 'card'} data-racer={player?.name}>
      <div class="card-head">
        <span class="dot" style={{ background: player?.color }} />
        <b>{player?.name ?? 'Someone'}</b>
        {player && !player.online && <span class="hint"> (left)</span>}
        <span class="place">
          {racer.place
            ? `${ordinal(racer.place)} · ${formatTime(racer.timeMs!)}`
            : standing
              ? `${ordinal(standing.place)} · didn’t finish`
              : running}
        </span>
      </div>
      <div class="bar">
        <div class="fill" style={{ width: `${percent(racer.filled, racer.total)}%` }} />
        <div class="right" style={{ width: `${percent(racer.correct, racer.total)}%` }} />
      </div>
      <div class="numbers">
        <span class="correct">{percent(racer.correct, racer.total)}% correct</span>
        <span>{percent(racer.filled, racer.total)}% filled</span>
        {racer.penaltyMs > 0 && <span class="penalty">+{formatTime(racer.penaltyMs)} penalties</span>}
      </div>
      {status.puzzle && <MiniBoard puzzle={status.puzzle} letters={racer.letters} status={racer.status} />}
    </div>
  );
}

function Results({ status, player }: { status: RaceViewStatus; player: (id: string) => Player | undefined }) {
  const { results, puzzle } = status;
  if (!results || !puzzle) return null;
  return (
    <section class="results">
      <div>
        <h2>Results</h2>
        <Standings standings={results.standings} player={player} />
      </div>
      <div>
        <h2>Solution{results.winner && ` · ${player(results.winner)?.name ?? 'Winner'}’s board`}</h2>
        <MiniBoard puzzle={puzzle} letters={results.solution} />
      </div>
      <div class="replay-section">
        <h2>Replay</h2>
        <ReplayPlayer
          puzzle={puzzle}
          events={results.replay}
          durationMs={results.durationMs}
          solution={results.solution}
          boards={results.standings.map(s => ({ id: s.id, label: player(s.id)?.name ?? 'Someone', color: player(s.id)?.color ?? '#888888', finishedAt: s.finishedMs }))}
        />
      </div>
    </section>
  );
}
