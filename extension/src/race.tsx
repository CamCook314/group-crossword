// The host's race view: lobby and settings, a live board for every racer (with % correct, which racers never see),
// and the results.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MiniBoard } from '../../shared/Crossword';
import type { Player } from '../../shared/protocol';
import { DEFAULT_PENALTY_SECONDS, formatTime, ordinal } from '../../shared/race';
import { useNow } from '../../shared/useNow';
import type { FromRaceView, RaceViewStatus } from './messages';
import type { RacerDetail } from './raceHost';

let port: browser.runtime.Port;
const send = (msg: FromRaceView) => port.postMessage(msg);

function connect(onStatus: (status: RaceViewStatus) => void) {
  port = browser.runtime.connect({ name: 'race' });
  port.onMessage.addListener(m => onStatus(m as RaceViewStatus));
  // The background page may not be running yet, so keep trying.
  port.onDisconnect.addListener(() => setTimeout(() => connect(onStatus), 500));
}

const percent = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

function App() {
  const [status, setStatus] = useState<RaceViewStatus | null>(null);
  useEffect(() => connect(setStatus), []);
  const now = useNow(status?.phase === 'countdown' || status?.phase === 'racing');
  if (!status) return null;
  const { phase, goAt } = status;
  const player = (id: string) => status.players.find(p => p.id === id);
  const clock = goAt === null ? '' : phase === 'countdown' ? '' : formatTime((status.endedAt ?? now) - goAt);

  return (
    <main>
      <header>
        <h1>Race</h1>
        {clock && <span class="clock">{clock}</span>}
        {phase === 'racing' && (
          <button class="secondary" onClick={() => send({ type: 'end' })}>
            End race
          </button>
        )}
        {phase === 'done' && <button onClick={() => send({ type: 'new-race' })}>New race</button>}
      </header>

      {phase === 'lobby' && <Lobby status={status} />}
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
    </main>
  );
}

function Lobby({ status }: { status: RaceViewStatus }) {
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

  // Play opens the racer's page in its own window, with the join form filled in with your name and colour.
  const play = () =>
    session &&
    browser.windows.create({
      url: `${session.link}?name=${encodeURIComponent(status.host.name)}&color=${encodeURIComponent(status.host.color)}`,
    });

  return (
    <>
      <section>
        <h2>Lobby</h2>
        {session ? (
          <div class="link">
            <input readOnly value={session.link} onFocus={e => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard.writeText(session.link)}>Copy</button>
            <button class="secondary" onClick={play} title="Race yourself, in a new window">
              Play
            </button>
            <span class="hint session-status">{session.status}</span>
          </div>
        ) : (
          <button onClick={() => send({ type: 'start-session' })}>Start session</button>
        )}
        <p class="puzzle">
          {pagePuzzle ? `${pagePuzzle.title} (${pagePuzzle.cols}×${pagePuzzle.rows})` : 'No crossword open'}
          {pagePuzzle && <span class={answersReady ? 'ok' : 'hint'}> · Answers: {answersReady ? `${answers} squares ✓` : answers === 'reading' ? 'reading…' : 'not found'}</span>}
        </p>
      </section>

      <section>
        <h2>Settings</h2>
        <label class="setting">
          <input
            type="checkbox"
            checked={settings.showOthersProgress}
            onChange={e => send({ type: 'settings', settings: { ...settings, showOthersProgress: e.currentTarget.checked } })}
          />
          Show racers how far everyone else has got (% filled)
        </label>
        <label class="setting">
          <input
            type="checkbox"
            checked={settings.penaltySeconds > 0}
            onChange={e =>
              send({ type: 'settings', settings: { ...settings, penaltySeconds: e.currentTarget.checked ? DEFAULT_PENALTY_SECONDS : 0 } })
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
            onChange={e => send({ type: 'settings', settings: { ...settings, penaltySeconds: Number(e.currentTarget.value) } })}
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
          <p class="hint">Nobody yet. Send them the link, or press Play to race yourself.</p>
        )}
        <button class="start" disabled={Boolean(problem)} onClick={() => send({ type: 'start' })}>
          Start race
        </button>
        {problem && <p class="hint">{problem}</p>}
      </section>
    </>
  );
}

function RacerCard({ racer, player, status, now }: { racer: RacerDetail; player?: Player; status: RaceViewStatus; now: number }) {
  const running = status.goAt !== null ? formatTime((status.endedAt ?? now) - status.goAt + racer.penaltyMs) : '';
  return (
    <div class={racer.finishedAt !== null ? 'card finished' : 'card'} data-racer={player?.name}>
      <div class="card-head">
        <span class="dot" style={{ background: player?.color }} />
        <b>{player?.name ?? 'Someone'}</b>
        {player && !player.online && <span class="hint"> (left)</span>}
        <span class="place">
          {racer.place ? `${ordinal(racer.place)} · ${formatTime(racer.timeMs!)}` : status.phase === 'done' ? 'Didn’t finish' : running}
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
        <ol class="standings">
          {[...status.racers]
            .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
            .map(r => (
              <li>
                <span class="dot" style={{ background: player(r.id)?.color }} />
                {player(r.id)?.name ?? 'Someone'}
                <span class="time">
                  {r.timeMs !== null ? formatTime(r.timeMs) : 'didn’t finish'}
                  {r.penaltyMs > 0 && ` (incl. +${formatTime(r.penaltyMs)})`}
                </span>
              </li>
            ))}
        </ol>
      </div>
      <div>
        <h2>Solution{results.winner && ` · ${player(results.winner)?.name ?? 'Winner'}’s board`}</h2>
        <MiniBoard puzzle={puzzle} letters={results.solution} />
      </div>
    </section>
  );
}

render(<App />, document.getElementById('app')!);
