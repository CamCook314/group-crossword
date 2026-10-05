// The bracket game's screen, for everyone. The host also gets the controls (`command`).
import { useState } from 'preact/hooks';
import { MAX_OPTION, type BracketCommand, type BracketMatch, type BracketMessage, type BracketState } from '../../../shared/games/bracket';
import type { Player } from '../../../shared/protocol';
import { PlayerList } from '../PlayerList';

interface Props {
  state: BracketState;
  players: Player[];
  me: string;
  send(msg: BracketMessage): void;
  command?(cmd: BracketCommand): void;
}

export function Bracket({ state, players, me, send, command }: Props) {
  const name = (id: string | null) => players.find(p => p.id === id)?.name ?? 'Someone';
  const online = players.filter(p => p.online);
  return (
    <div class="game bracket">
      <h1>{state.category || 'Bracket'}</h1>
      {state.phase === 'category' && <Category command={command} />}
      {state.phase === 'options' && (
        <>
          <OptionForm send={send} sent={state.submitted.includes(me)} />
          <p class="hint">
            In so far: {state.submitted.length} of {online.length}
            {state.submitted.length ? ` (${state.submitted.map(name).join(', ')})` : ''}
          </p>
          {command && (
            <button onClick={() => command({ type: 'make-bracket' })} disabled={state.submitted.length < 2}>
              Make the bracket ({state.submitted.length} options)
            </button>
          )}
        </>
      )}
      {state.phase === 'voting' && state.current !== null && (
        <Vote key={`${state.rounds.length}-${state.current}`} state={state} match={state.rounds.at(-1)![state.current]} send={send} voted={state.voted.includes(me)} />
      )}
      {state.phase === 'voting' && (
        <p class="hint">
          Voted: {state.voted.length} of {online.length}
          {command && (
            <button class="secondary" onClick={() => command({ type: 'decide' })}>
              Decide now
            </button>
          )}
        </p>
      )}
      {state.phase === 'done' && state.winner !== null && (
        <div class="bracket-winner">
          <p class="hint">The winner</p>
          <h2>{state.options[state.winner].text}</h2>
          <p class="hint">put forward by {name(state.options[state.winner].by)}</p>
          {command && <button onClick={() => command({ type: 'again' })}>Play again</button>}
        </div>
      )}
      {state.rounds.length > 0 && <Rounds state={state} name={name} />}
      <PlayerList players={players} me={me} />
    </div>
  );
}

function Category({ command }: { command?: Props['command'] }) {
  const [text, setText] = useState('');
  if (!command) return <p class="hint">Waiting for the host to choose a category…</p>;
  return (
    <form
      class="bracket-form"
      onSubmit={e => {
        e.preventDefault();
        if (text.trim()) command({ type: 'category', text });
      }}
    >
      <label>
        Category, e.g. “best biscuit”
        <input autoFocus maxLength={80} value={text} onInput={e => setText(e.currentTarget.value)} />
      </label>
      <button type="submit">Ask for options</button>
    </form>
  );
}

function OptionForm({ send, sent }: { send: Props['send']; sent: boolean }) {
  const [text, setText] = useState('');
  const [mine, setMine] = useState('');
  return (
    <form
      class="bracket-form"
      onSubmit={e => {
        e.preventDefault();
        if (!text.trim()) return;
        send({ t: 'bracket-option', text });
        setMine(text.trim());
        setText('');
      }}
    >
      <label>
        Your option (only you know it's yours, until the end)
        <input autoFocus maxLength={MAX_OPTION} value={text} onInput={e => setText(e.currentTarget.value)} />
      </label>
      <button type="submit">{sent ? 'Change it' : 'Put it forward'}</button>
      {sent && mine && <p class="hint">Yours: {mine}</p>}
    </form>
  );
}

function Vote({ state, match, send, voted }: { state: BracketState; match: BracketMatch; send: Props['send']; voted: boolean }) {
  const [pick, setPick] = useState<'a' | 'b' | null>(null);
  const side = (s: 'a' | 'b') => {
    const option = state.options[match[s]!];
    return (
      <button
        class={pick === s ? 'bracket-side picked' : 'bracket-side'}
        onClick={() => {
          setPick(s);
          send({ t: 'bracket-vote', pick: s });
        }}
      >
        {option.text}
      </button>
    );
  };
  return (
    <div class="bracket-vote">
      <p class="hint">Round {state.rounds.length}: which is better?</p>
      <div class="bracket-sides">
        {side('a')}
        <span class="versus">vs</span>
        {side('b')}
      </div>
      {voted && <p class="hint">Vote in; you can still change it.</p>}
    </div>
  );
}

function Rounds({ state, name }: { state: BracketState; name: (id: string | null) => string }) {
  const text = (i: number | null) => (i === null ? 'bye' : state.options[i].text);
  return (
    <div class="bracket-rounds">
      {state.rounds.map((round, r) => (
        <div class="bracket-round">
          <h3>{round.length === 1 && r > 0 ? 'Final' : `Round ${r + 1}`}</h3>
          {round.map((m, i) => (
            <div class={r === state.rounds.length - 1 && i === state.current ? 'bracket-match current' : 'bracket-match'}>
              {[m.a, m.b].map(o => (
                <div class={m.winner !== null && o === m.winner ? 'won' : m.winner !== null ? 'lost' : ''}>
                  {text(o)}
                  {state.phase === 'done' && o !== null && <span class="hint"> · {name(state.options[o].by)}</span>}
                </div>
              ))}
              {m.winner !== null && m.b !== null && (
                <div class="hint score">
                  {m.votesA}–{m.votesB}
                  {m.coinToss && ' (coin toss)'}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
