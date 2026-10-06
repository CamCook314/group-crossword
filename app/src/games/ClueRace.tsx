// The cryptic clue race's screen, for everyone. The host also gets the controls (`command`).
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { COUNT, MAX_GUESS, SECONDS, type ClueInPlay, type ClueRaceCommand, type ClueRaceMessage, type ClueRaceState } from '../../../shared/games/clues';
import type { Player } from '../../../shared/protocol';
import { useNow } from '../../../shared/useNow';
import { PlayerList } from '../PlayerList';

interface Props {
  state: ClueRaceState;
  players: Player[];
  me: string;
  send(msg: ClueRaceMessage): void;
  command?(cmd: ClueRaceCommand): void;
}

export function ClueRace(props: Props) {
  const { state, players, me, command } = props;
  return (
    <div class="game clue-race">
      <h1>Cryptic clue race</h1>
      {state.phase === 'setup' && (command ? <Setup state={state} command={command} /> : <p class="hint">Waiting for the host to start…</p>)}
      {state.phase === 'loading' && <p class="hint">Getting the clues…</p>}
      {state.clue && <Clue key={state.index} {...props} clue={state.clue} />}
      {state.phase === 'done' && (
        <>
          <Scores state={state} players={players} me={me} />
          {command && <button onClick={() => command({ type: 'again' })}>Play again</button>}
        </>
      )}
      <PlayerList players={players} me={me} />
      <p class="hint">
        Clues from{' '}
        <a href="https://cryptics.georgeho.org" target="_blank" rel="noopener">
          cryptics.georgeho.org
        </a>
      </p>
    </div>
  );
}

function Setup({ state, command }: { state: ClueRaceState; command: NonNullable<Props['command']> }) {
  const [count, setCount] = useState(state.count);
  const [seconds, setSeconds] = useState(state.seconds);
  return (
    <form
      class="clue-race-form"
      onSubmit={e => {
        e.preventDefault();
        command({ type: 'start', count, seconds });
      }}
    >
      <label>
        Clues
        <input type="number" required min={COUNT.min} max={COUNT.max} value={count} onInput={e => setCount(e.currentTarget.valueAsNumber)} />
      </label>
      <label>
        Seconds for each
        <input type="number" required min={SECONDS.min} max={SECONDS.max} value={seconds} onInput={e => setSeconds(e.currentTarget.valueAsNumber)} />
      </label>
      <button type="submit">Start</button>
      {state.error && <p class="clue-race-error">{state.error}</p>}
    </form>
  );
}

/** The clue's text, with the definition underlined once the hint is showing. */
function ClueText({ clue }: { clue: ClueInPlay }) {
  const parts: ComponentChildren[] = [];
  let at = 0;
  for (const [start, end] of clue.hint) {
    if (start < at) continue;
    parts.push(clue.text.slice(at, start), <u class="definition">{clue.text.slice(start, end)}</u>);
    at = end;
  }
  parts.push(clue.text.slice(at));
  return (
    <p class="clue-race-clue">
      {parts} <span class="enumeration">({clue.enumeration})</span>
    </p>
  );
}

function Clue({ state, players, me, send, command, clue }: Props & { clue: ClueInPlay }) {
  const [guess, setGuess] = useState('');
  const revealed = state.phase === 'reveal';
  const solved = state.solved.some(s => s.id === me);
  // When the time is up, on this computer's clock, worked out from the host's.
  const endsAt = useMemo(() => Date.now() + state.msLeft, [state]);
  const now = useNow(!revealed);
  const name = (id: string) => players.find(p => p.id === id)?.name ?? 'Someone';
  return (
    <div class="clue-race-round">
      <div class="clue-race-head">
        <span class="hint">
          Clue {state.index + 1} of {state.count}
          {clue.puzzle && ` · ${clue.puzzle}`}
        </span>
        {!revealed && <span class="clue-race-clock">{Math.max(0, Math.ceil((endsAt - now) / 1000))}</span>}
      </div>
      <ClueText clue={clue} />
      {!revealed &&
        (solved ? (
          <p class="clue-race-solved">Solved ✓</p>
        ) : (
          <form
            class="clue-race-guess"
            onSubmit={e => {
              e.preventDefault();
              if (!guess.trim()) return;
              send({ t: 'clues-guess', guess });
              setGuess('');
            }}
          >
            <input autoFocus maxLength={MAX_GUESS} placeholder="Your answer" value={guess} onInput={e => setGuess(e.currentTarget.value)} />
            <button type="submit">Guess</button>
          </form>
        ))}
      {revealed && (
        <div class="clue-race-answer">
          <h2>{clue.answer}</h2>
          {clue.definition && <p class="hint">Definition: {clue.definition}</p>}
          {clue.source && (
            <a href={clue.source} target="_blank" rel="noopener">
              How it works
            </a>
          )}
        </div>
      )}
      {state.solved.length > 0 && (
        <p class="hint">
          Solved by {state.solved.map(s => `${name(s.id)} (+${s.points})`).join(', ')}
        </p>
      )}
      {command && (
        <div class="clue-race-controls">
          {!revealed && (
            <button class="secondary" onClick={() => command({ type: 'reveal' })}>
              Reveal now
            </button>
          )}
          <button class={revealed ? '' : 'secondary'} onClick={() => command({ type: 'next' })}>
            {state.index + 1 < state.count ? (revealed ? 'Next clue' : 'Skip') : 'See the scores'}
          </button>
        </div>
      )}
    </div>
  );
}

function Scores({ state, players, me }: { state: ClueRaceState; players: Player[]; me: string }) {
  const score = (id: string) => state.scores[id] ?? 0;
  const ranked = players.filter(p => p.online || p.id in state.scores).sort((a, b) => score(b.id) - score(a.id));
  return (
    <>
      <h2>Final scores</h2>
      <ol class="standings">
        {ranked.map(p => (
          <li value={1 + ranked.filter(o => score(o.id) > score(p.id)).length} class={p.id === me ? 'me' : ''}>
            <span class="dot" style={{ background: p.color }} />
            {p.name}
            <span class="points">{score(p.id)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
