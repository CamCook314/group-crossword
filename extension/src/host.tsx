// The host's full view: the session, a mode switch, and either the co-op board (with the suggestion queue and tools)
// or the race. The sidebar stays as the quick control panel.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CoopView } from './CoopView';
import type { Command, FullViewStatus } from './messages';
import { RaceView } from './RaceView';

let port: browser.runtime.Port;
const send = (msg: Command) => port.postMessage(msg);

function connect(onStatus: (status: FullViewStatus) => void) {
  port = browser.runtime.connect({ name: 'full' });
  port.onMessage.addListener(m => onStatus(m as FullViewStatus));
  // The background page may not be running yet, so keep trying.
  port.onDisconnect.addListener(() => setTimeout(() => connect(onStatus), 500));
}

function App() {
  const [full, setFull] = useState<FullViewStatus | null>(null);
  useEffect(() => connect(setFull), []);
  if (!full) return null;
  const { sidebar } = full;
  const { session, mode } = sidebar;
  const racing = sidebar.racePhase === 'countdown' || sidebar.racePhase === 'racing';

  return (
    <main>
      <header class="top">
        <h1>Group Crossword</h1>
        <div class="modes" title={racing ? 'Finish or end the race first' : undefined}>
          {(['coop', 'race'] as const).map(m => (
            <button class={m === mode ? 'mode picked' : 'mode'} disabled={racing} onClick={() => send({ type: 'mode', mode: m })}>
              {m === 'coop' ? 'Co-op' : 'Race'}
            </button>
          ))}
        </div>
        {session ? (
          <div class="link">
            <input readOnly value={session.link} onFocus={e => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard.writeText(session.link)}>Copy</button>
            <span class="hint session-status">{session.status}</span>
          </div>
        ) : (
          <button onClick={() => send({ type: 'start' })}>Start session</button>
        )}
      </header>
      {mode === 'coop' ? <CoopView status={sidebar} replay={full.replay} send={send} /> : <RaceView status={full.race} send={send} />}
    </main>
  );
}

render(<App />, document.getElementById('app')!);
