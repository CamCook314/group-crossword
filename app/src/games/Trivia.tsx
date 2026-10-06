// Trivia's screen, for everyone. The host also gets the controls (`command`).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { QUESTIONS, SECONDS, type TriviaCommand, type TriviaMessage, type TriviaSettings, type TriviaState } from '../../../shared/games/trivia';
import type { Player } from '../../../shared/protocol';
import { useNow } from '../../../shared/useNow';
import { PlayerList } from '../PlayerList';

interface Props {
  state: TriviaState;
  players: Player[];
  me: string;
  send(msg: TriviaMessage): void;
  command?(cmd: TriviaCommand): void;
}

export function Trivia(props: Props) {
  const { state, players, me, command } = props;
  return (
    <div class="game trivia">
      <h1>Trivia</h1>
      {state.phase === 'setup' && (command ? <Setup state={state} command={command} /> : <p class="hint">Waiting for the host to start…</p>)}
      {state.phase === 'loading' && <p class="hint">Getting the questions…</p>}
      {state.question && <Question key={state.index} {...props} />}
      {state.phase === 'done' && (
        <>
          <Scores state={state} players={players} me={me} />
          {command && <button onClick={() => command({ type: 'again' })}>Play again</button>}
        </>
      )}
      <PlayerList players={players} me={me} />
      <p class="hint">
        Questions from{' '}
        <a href="https://opentdb.com" target="_blank" rel="noopener">
          Open Trivia DB
        </a>{' '}
        (CC BY-SA 4.0)
      </p>
    </div>
  );
}

function Setup({ state, command }: { state: TriviaState; command: NonNullable<Props['command']> }) {
  const [settings, setSettings] = useState(state.settings);
  const set = (change: Partial<TriviaSettings>) => setSettings(s => ({ ...s, ...change }));
  useEffect(() => command({ type: 'categories' }), []);
  return (
    <form
      class="trivia-form"
      onSubmit={e => {
        e.preventDefault();
        command({ type: 'start', settings });
      }}
    >
      <label>
        Category
        <select value={settings.category ?? ''} onChange={e => set({ category: Number(e.currentTarget.value) || null })}>
          <option value="">Any</option>
          {state.categories.map(c => (
            <option value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label>
        Difficulty
        <select value={settings.difficulty ?? ''} onChange={e => set({ difficulty: (e.currentTarget.value || null) as TriviaSettings['difficulty'] })}>
          <option value="">Any</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <label>
        Questions
        <input type="number" required min={QUESTIONS.min} max={QUESTIONS.max} value={settings.questions} onInput={e => set({ questions: e.currentTarget.valueAsNumber })} />
      </label>
      <label>
        Seconds for each
        <input type="number" required min={SECONDS.min} max={SECONDS.max} value={settings.seconds} onInput={e => set({ seconds: e.currentTarget.valueAsNumber })} />
      </label>
      <button type="submit">Start</button>
      {state.error && <p class="trivia-error">{state.error}</p>}
    </form>
  );
}

function Question({ state, players, me, send, command }: Props) {
  const question = state.question!;
  const revealed = state.phase === 'revealed';
  const [pick, setPick] = useState<number | null>(null);
  const mine = revealed ? state.picks![me] : pick;
  // When the time is up, on this computer's clock, worked out from the host's.
  const endsAt = useMemo(() => Date.now() + state.msLeft, [state]);
  const now = useNow(!revealed);
  const name = (id: string) => players.find(p => p.id === id)?.name ?? 'Someone';
  return (
    <div class="trivia-question">
      <div class="trivia-head">
        <span class="hint">
          Question {state.index + 1} of {state.total} · {question.category} · {question.difficulty}
        </span>
        {!revealed && <span class="trivia-clock">{Math.max(0, Math.ceil((endsAt - now) / 1000))}</span>}
      </div>
      <h2>{question.text}</h2>
      <div class="trivia-answers">
        {question.answers.map((answer, i) => (
          <button
            class={['trivia-answer', i === mine && 'picked', revealed && i === state.correct && 'right'].filter(Boolean).join(' ')}
            disabled={revealed}
            onClick={() => {
              setPick(i);
              send({ t: 'trivia-pick', answer: i });
            }}
          >
            {answer}
          </button>
        ))}
      </div>
      {!revealed && (
        <p class="hint">
          {state.answered.includes(me) && 'Answer in; you can still change it. '}
          Answered: {state.answered.length} of {players.filter(p => p.online).length}
          {state.answered.length ? ` (${state.answered.map(name).join(', ')})` : ''}
          {command && (
            <button class="secondary" onClick={() => command({ type: 'reveal' })}>
              Reveal now
            </button>
          )}
        </p>
      )}
      {revealed && (
        <>
          <ul class="trivia-picks">
            {players
              .filter(p => p.online || p.id in state.picks!)
              .map(p => {
                const answer = state.picks![p.id];
                return (
                  <li class={answer === state.correct ? 'right' : ''}>
                    <span class="dot" style={{ background: p.color }} />
                    {p.name}: {answer === undefined ? 'no answer' : question.answers[answer]}
                    {answer === state.correct && ' ✓'}
                  </li>
                );
              })}
          </ul>
          {command && <button onClick={() => command({ type: 'next' })}>{state.index + 1 < state.total ? 'Next question' : 'See the scores'}</button>}
        </>
      )}
    </div>
  );
}

function Scores({ state, players, me }: { state: TriviaState; players: Player[]; me: string }) {
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
            <span class="points">
              {score(p.id)} of {state.total}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
