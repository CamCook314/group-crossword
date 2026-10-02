// The host's control panel: start a session, share the link, see players, accept or reject suggestions.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { COLORS, type Suggestion } from '../../shared/protocol';
import { clashes } from '../../shared/suggestions';
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
  const { state, host, session } = status;
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
        <Swatches value={host.color} onPick={color => send({ type: 'host', host: { ...host, color } })} />
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
          {state.suggestions.length === 0 && <p class="hint">None yet.</p>}
          {puzzle &&
            state.suggestions.map(s => {
              const clue = puzzle.clues.find(c => c.id === s.clueId);
              const player = state.players.find(p => p.id === s.playerId);
              const clash = clashes(puzzle, state.letters, s);
              return (
                <div class="suggestion" key={s.playerId + s.clueId} style={{ borderColor: player?.color }}>
                  <div class="who">
                    <span class="dot" style={{ background: player?.color }} /> {player?.name ?? 'Someone'} · <b>{s.clueId}</b>
                  </div>
                  <div class="clue">{clue?.text}</div>
                  <div class="letters">
                    {s.letters.map((l, i) => {
                      const existing = clue ? state.letters[clue.cells[i]] : '';
                      return (
                        <span class={clash[i] ? 'clash' : l ? '' : 'blank'} title={clash[i] ? `Replaces ${existing}` : undefined}>
                          {l || existing || '·'}
                        </span>
                      );
                    })}
                  </div>
                  <div class="actions">
                    <button onClick={() => decide('accept', s)}>Accept</button>
                    <button class="secondary" onClick={() => decide('reject', s)}>Reject</button>
                  </div>
                </div>
              );
            })}
        </section>
      )}
    </main>
  );
}

const decide = (type: 'accept' | 'reject', s: Suggestion) => send({ type, playerId: s.playerId, clueId: s.clueId });

function Swatches({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <div class="swatches">
      {COLORS.map(c => (
        <button key={c} class={c === value ? 'swatch picked' : 'swatch'} style={{ background: c }} title={c} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
