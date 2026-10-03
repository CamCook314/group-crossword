// The host's control panel: start a session, share the link, see players, accept or reject suggestions, and open the
// full-page view.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ColorPicker } from '../../shared/ColorPicker';
import type { Command, SidebarStatus } from './messages';
import { SuggestionList } from './SuggestionList';

let port: browser.runtime.Port;
const send = (msg: Command) => port.postMessage(msg);

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
  const { state, host, session, mode, pagePuzzle } = status;
  const racing = status.racePhase === 'countdown' || status.racePhase === 'racing';

  return (
    <main>
      <section>
        <div class="modes" title={racing ? 'Finish or end the race first' : undefined}>
          {(['coop', 'race'] as const).map(m => (
            <button class={m === mode ? 'mode picked' : 'mode'} disabled={racing} onClick={() => send({ type: 'mode', mode: m })}>
              {m === 'coop' ? 'Co-op' : 'Race'}
            </button>
          ))}
        </div>
        <button class="secondary full-view" onClick={() => browser.tabs.create({ url: browser.runtime.getURL('host.html') })}>
          Open full view
        </button>
      </section>

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
        <p>{pagePuzzle ? `${pagePuzzle.title} (${pagePuzzle.cols}×${pagePuzzle.rows})` : 'Open a crossword on Crosshare or Courier Mail.'}</p>
        {status.answers !== null && (
          <p class="hint answers">
            Answers:{' '}
            {status.answers === 'reading' ? 'reading…' : status.answers === 'none' ? 'not found' : `${status.answers} squares ✓`}
          </p>
        )}
      </section>

      {mode === 'race' && (
        <section>
          <h2>Race</h2>
          <p class="hint">
            {status.racePhase === 'lobby'
              ? 'Set up and start the race from the full view.'
              : status.racePhase === 'done'
                ? 'The race is over.'
                : 'Race in progress.'}
          </p>
        </section>
      )}

      {session && mode === 'coop' && (
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

      {session && mode === 'coop' && (
        <section>
          <h2>Suggestions</h2>
          <SuggestionList status={status} send={send} />
        </section>
      )}
    </main>
  );
}

render(<App />, document.getElementById('app')!);
