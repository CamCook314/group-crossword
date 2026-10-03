// The host's control panel: start a session, share the link, see players, accept or reject suggestions.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ColorPicker } from '../../shared/ColorPicker';
import { AGREED_COLOR, clashes, groupSuggestions } from '../../shared/suggestions';
import type { FromSidebar, SidebarStatus } from './messages';

let port: browser.runtime.Port;
const send = (msg: FromSidebar) => port.postMessage(msg);

function connect(onStatus: (status: SidebarStatus) => void) {
  port = browser.runtime.connect({ name: 'sidebar' });
  port.onMessage.addListener(m => onStatus(m as SidebarStatus));
  // The background page may not be running yet (e.g. Firefox reopening the sidebar at startup), so keep trying.
  port.onDisconnect.addListener(() => setTimeout(() => connect(onStatus), 500));
}

function App() {
  const [status, setStatus] = useState<SidebarStatus | null>(null);
  useEffect(() => connect(setStatus), []);
  if (!status) return null;
  const { state, host, session, undo } = status;
  const { puzzle } = state;

  return (
    <main>
      <section>
        <h2>You</h2>
        <input
          class="name"
          defaultValue={host.name}
          maxLength={24}
          onChange={e => send({ type: 'host', host: { ...host, name: e.currentTarget.value.trim() || 'Host' } })}
        />
        <ColorPicker value={host.color} onPick={color => send({ type: 'host', host: { ...host, color } })} />
      </section>

      <section>
        <h2>Session</h2>
        {session ? (
          <>
            <p class="status">{session.status}</p>
            <div class="link">
              <input readOnly value={session.link} onFocus={e => e.currentTarget.select()} />
              <button onClick={() => navigator.clipboard.writeText(session.link)}>Copy</button>
            </div>
            <button class="secondary" onClick={() => send({ type: 'stop' })}>End session</button>
          </>
        ) : (
          <button onClick={() => send({ type: 'start' })}>Start session</button>
        )}
      </section>

      <section>
        <h2>Puzzle</h2>
        <p>{puzzle ? `${puzzle.title} (${puzzle.cols}×${puzzle.rows})` : 'Open a crossword on Crosshare or Courier Mail.'}</p>
        {status.answers !== null && (
          <p class="hint answers">
            Answers:{' '}
            {status.answers === 'reading' ? 'reading…' : status.answers === 'none' ? 'not found' : `${status.answers} squares ✓`}
          </p>
        )}
      </section>

      {session && (
        <section>
          <h2>Players</h2>
          <ul class="players">
            {state.players.map(p => (
              <li key={p.id} class={p.online ? '' : 'offline'}>
                <span class="dot" style={{ background: p.color }} />
                {p.name}
                {p.host && ' (you)'}
                {!p.online && ' (left)'}
                {p.clueId && <span class="on-clue">{p.clueId}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {session && (
        <section>
          <h2>Suggestions</h2>
          {undo && (
            <button class="secondary undo" onClick={() => send({ type: 'undo' })}>
              Undo accept: {names(undo.playerIds)} · {undo.clueId}
            </button>
          )}
          {state.suggestions.length === 0 && <p class="hint">None yet.</p>}
          {puzzle &&
            groupSuggestions(state.suggestions).map(g => {
              const clue = puzzle.clues.find(c => c.id === g.clueId);
              const players = g.playerIds.map(id => state.players.find(p => p.id === id));
              const clash = clashes(puzzle, state.letters, g);
              const agreed = players.length > 1;
              return (
                <div
                  class={agreed ? 'suggestion agreed' : 'suggestion'}
                  key={g.clueId + g.letters.join()}
                  style={{ borderColor: agreed ? AGREED_COLOR : players[0]?.color }}
                >
                  <div class="who">
                    {players.map(p => (
                      <span class="dot" style={{ background: p?.color }} />
                    ))}{' '}
                    {names(g.playerIds)} · <b>{g.clueId}</b>
                    {agreed && <span class="agree-count">{players.length} agree</span>}
                  </div>
                  <div class="clue">{clue?.text}</div>
                  <div class="letters">
                    {g.letters.map((l, i) => {
                      const existing = clue ? state.letters[clue.cells[i]] : '';
                      return (
                        <span class={clash[i] ? 'clash' : l ? '' : 'blank'} title={clash[i] ? `Replaces ${existing}` : undefined}>
                          {l || existing || '·'}
                        </span>
                      );
                    })}
                  </div>
                  <div class="actions">
                    <button onClick={() => send({ type: 'accept', clueId: g.clueId, letters: g.letters })}>Accept</button>
                    <button class="secondary" onClick={() => send({ type: 'reject', clueId: g.clueId, letters: g.letters })}>
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
        </section>
      )}
    </main>
  );

  function names(ids: string[]) {
    return ids.map(id => state.players.find(p => p.id === id)?.name ?? 'Someone').join(' + ');
  }
}

render(<App />, document.getElementById('app')!);
